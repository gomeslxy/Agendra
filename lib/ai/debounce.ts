import crypto from 'crypto';
import { redis } from '@/lib/infra/redis';
import { handleIncomingMessage } from './engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { logDebug, logError } from '@/lib/logging';
import { qstashEnabled, scheduleDelayed } from '@/lib/infra/qstash';
import type { CompanyUsage } from '@/lib/billing/limits';
import { getCompanyUsage } from '@/lib/billing/limits';
import { runWithDeadline } from './deadline';
import type { IncomingMessage } from '@/lib/channels/types';

const DEBOUNCE_FAST_MS = 1_000;
const DEBOUNCE_BURST_MS = 2_500;
const BUF_TTL_SEC = 60;
const PRE_IDS_TTL_SEC = 300;
export const FLUSH_PATH = '/api/internal/flush';

function debounceDelayFor(body: string): number {
  const t = (body ?? '').trim();
  const looksFragmented = t.length < 25 && !/[.?!]$/.test(t);
  return looksFragmented ? DEBOUNCE_BURST_MS : DEBOUNCE_FAST_MS;
}

export interface FlushJob {
  companyId: string;
  leadPhone: string;
  leadName: string;
  gen: string;
  usage?: CompanyUsage;
}

interface BufferedMessageRow {
  provider_message_id: string;
  company_id: string;
  lead_phone: string;
  lead_name: string | null;
  body: string | null;
  msg_type: string;
  metadata: Record<string, unknown> | null;
  flush_after: string;
  flushed: boolean;
  created_at?: string;
}

/**
 * Buffers the incoming message directly into the PostgreSQL `message_buffer` table,
 * schedules a background processing turn via QStash, and returns immediately.
 */
export async function bufferAndQueueMessage(args: {
  companyId: string;
  leadPhone: string;
  leadName: string;
  body: string;
  providerMessageId: string;
  msgType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const dbgTag = `${args.companyId.slice(0, 6)}:${args.leadPhone.slice(-4)}`;
  const delayMs = debounceDelayFor(args.body);
  const gen = crypto.randomBytes(8).toString('hex');
  const tokenKey = `ch:bufgen:${args.companyId}:${args.leadPhone}`;
  const preIdsKey = `ch:pre_ids:${args.companyId}:${args.leadPhone}`;

  const admin = createAdminClient();

  // 1. Pre-save to messages table for real-time inbox view before inserting message_buffer
  // so `pre_message_id` is durably stored in buffer metadata as well.
  let preMessageId: string | null = null;
  try {
    const { data: leadRow } = await admin
      .from('leads')
      .select('id')
      .eq('company_id', args.companyId)
      .eq('phone', args.leadPhone)
      .maybeSingle();

    if (leadRow?.id) {
      const { data: ins } = await admin
        .from('messages')
        .insert({
          lead_id: leadRow.id,
          company_id: args.companyId,
          role: 'user',
          content: args.body || '',
          metadata: args.metadata ?? null,
        })
        .select('id')
        .single();

      if (ins?.id) {
        preMessageId = ins.id as string;
        await redis.rpush(preIdsKey, preMessageId);
        await redis.expire(preIdsKey, PRE_IDS_TTL_SEC);
        logDebug(`[Debounce][${dbgTag}] pre-saved message ${preMessageId.slice(0, 8)}`);
      }
    }
  } catch (e) {
    logError(`[debounce][${dbgTag}] pre-save failed (non-fatal):`, e);
  }

  // 2. Durably insert the message into PostgreSQL message_buffer
  const { error } = await admin.from('message_buffer').insert({
    provider_message_id: args.providerMessageId,
    company_id: args.companyId,
    lead_phone: args.leadPhone,
    lead_name: args.leadName,
    body: args.body || '',
    msg_type: args.msgType,
    metadata: {
      ...(args.metadata ?? {}),
      gen,
      attempt_count: 1,
      ...(preMessageId ? { pre_message_id: preMessageId } : {}),
    },
    flush_after: new Date(Date.now() + delayMs).toISOString(),
    flushed: false,
  });

  if (error) {
    logError(`[debounce][${dbgTag}] PostgreSQL buffer insert failed: ${error.message}`);
    throw new Error(`Failed to buffer message in DB: ${error.message}`);
  }

  // 3. Set the gen token in Redis to enable debounce comparison on flush
  try {
    await redis.set(tokenKey, gen, BUF_TTL_SEC);
  } catch (e) {
    logError(`[debounce][${dbgTag}] Redis gen token set failed (non-fatal):`, e);
  }

  const job: FlushJob = {
    companyId: args.companyId,
    leadPhone: args.leadPhone,
    leadName: args.leadName,
    gen,
  };

  // 4. Schedule background flush via QStash (or local setTimeout in dev)
  const runLocalFallback = () => {
    setTimeout(() => {
      void runWithDeadline(() => flushBuffer(job)).catch((err) => {
        logError(`[debounce][${dbgTag}] local fallback flush run failed:`, err);
      });
    }, delayMs);
  };

  if (qstashEnabled()) {
    try {
      await scheduleDelayed(FLUSH_PATH, job, Math.ceil(delayMs / 1000));
      logDebug(`[Debounce][${dbgTag}] scheduled flush via QStash (gen=${gen.slice(0, 6)})`);
    } catch (e) {
      logError(`[debounce][${dbgTag}] QStash schedule failed, falling back to local setTimeout:`, e);
      runLocalFallback();
    }
  } else {
    logDebug(`[Debounce][${dbgTag}] scheduling local setTimeout (+${delayMs}ms)`);
    runLocalFallback();
  }
}

export async function bufferAndDebounce(args: {
  companyId: string;
  leadPhone: string;
  leadName: string;
  body: string;
  providerMessageId: string;
  msgType: string;
  usage?: CompanyUsage;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return bufferAndQueueMessage(args);
}

/**
 * Consolidates the buffered database messages for a specific lead, transcribes/downloads
 * media attachments in the background, and executes the AI turn.
 */
export async function flushBuffer(job: FlushJob): Promise<void> {
  const tokenKey = `ch:bufgen:${job.companyId}:${job.leadPhone}`;
  const preIdsKey = `ch:pre_ids:${job.companyId}:${job.leadPhone}`;
  const dbgTag = `${job.companyId.slice(0, 6)}:${job.leadPhone.slice(-4)}`;

  // 1. Atomic Debounce Guard via Lua CAS
  const claimed = await redis.claimFlushGen(tokenKey, job.gen, 280);
  if (claimed === false) {
    logDebug(`[Debounce][${dbgTag}] superseded or already claimed, exiting (gen=${job.gen.slice(0, 6)})`);
    return;
  }

  const admin = createAdminClient();

  try {
    // 2. Fetch all unflushed buffer messages for this lead
    const { data: rawItemsData, error } = await admin
      .from('message_buffer')
      .select('*')
      .eq('flushed', false)
      .eq('company_id', job.companyId)
      .eq('lead_phone', job.leadPhone)
      .order('created_at', { ascending: true });

    if (error) {
      logError(`[Debounce][${dbgTag}] Failed to query message_buffer: ${error.message}`);
      throw error;
    }

    const rawItems = (rawItemsData ?? []) as BufferedMessageRow[];
    if (rawItems.length === 0) {
      logDebug(`[Debounce][${dbgTag}] empty buffer at SQL flush`);
      return;
    }

    const firstMeta = (rawItems[0].metadata ?? {}) as Record<string, unknown>;
    const attemptCount = Number(firstMeta.attempt_count ?? 1);
    const channelId = typeof firstMeta.channelId === 'string' ? firstMeta.channelId : undefined;
    const channelProvider =
      typeof firstMeta.channelProvider === 'string' ? firstMeta.channelProvider : 'whatsapp';

    // 3. Resolve Channel for media routing
    let channelToken: string | null = null;
    if (channelId) {
      const { data: channelRow } = await admin
        .from('channels')
        .select('id, access_token, access_token_secret_id')
        .eq('id', channelId)
        .maybeSingle();

      if (channelRow) {
        const rawTok = channelRow.access_token as string | null;
        if (rawTok) {
          channelToken = rawTok;
        } else if (channelRow.access_token_secret_id) {
          const { data: tokenData } = await admin.rpc('channel_get_access_token', {
            p_channel_id: channelRow.id,
          });
          channelToken = (tokenData as string | null) ?? null;
        }
      }
    }

    // 4. Download and transcribe media attachments in background
    const { routeMedia } = await import('@/lib/ai/media-router');
    const items: BufferedMessageRow[] = [];

    for (const item of rawItems) {
      let text = item.body || '';
      let itemMetadata: Record<string, unknown> = { ...(item.metadata ?? {}) };

      const isMedia = item.msg_type !== 'text';
      const hasMediaMetadata = Boolean(itemMetadata.mediaId || itemMetadata.mediaUrl);
      if (isMedia && channelToken && !text && hasMediaMetadata) {
        logDebug(`[Debounce][${dbgTag}] transcribing media (type=${item.msg_type})`);
        try {
          const msgForRouting: IncomingMessage = {
            provider: channelProvider as IncomingMessage['provider'],
            channelId: channelId ?? '',
            companyId: job.companyId,
            type: item.msg_type as IncomingMessage['type'],
            providerMessageId: item.provider_message_id,
            senderIdentifier: item.lead_phone,
            senderName: item.lead_name ?? '',
            text: item.body ?? '',
            mediaId:
              typeof itemMetadata.mediaId === 'string'
                ? itemMetadata.mediaId
                : typeof itemMetadata.mediaUrl === 'string'
                  ? itemMetadata.mediaUrl
                  : undefined,
            mediaCaption:
              typeof itemMetadata.mediaCaption === 'string'
                ? itemMetadata.mediaCaption
                : undefined,
            rawPayload: itemMetadata,
            timestamp: new Date(),
          };
          const routed = await routeMedia(msgForRouting, channelToken);
          text = routed.body || '';
          itemMetadata = { ...itemMetadata, ...routed.metadata };

          // P0-ENG-05: Atualizar mensagem pré-salva no inbox com a transcrição/descrição gerada
          if (typeof itemMetadata.pre_message_id === 'string' && text) {
            await admin
              .from('messages')
              .update({ content: text, metadata: itemMetadata })
              .eq('id', itemMetadata.pre_message_id)
              .eq('company_id', job.companyId);
          }
        } catch (mediaErr: unknown) {
          const msg = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
          logError(`[Debounce][${dbgTag}] Background media routing failed:`, msg);
          text = '[Arquivo de mídia não pôde ser processado]';
        }
      }

      items.push({
        ...item,
        body: text,
        metadata: itemMetadata,
      });
    }

    // 5. Consolidate bodies and metadata
    const receivedAtList = items
      .map((i) => i.metadata?.received_at)
      .filter((v): v is number => typeof v === 'number');
    const minReceivedAt = receivedAtList.length > 0 ? Math.min(...receivedAtList) : undefined;

    const mergedMetadata = items.reduce<Record<string, unknown>>(
      (acc, i) => ({ ...acc, ...(i.metadata ?? {}) }),
      {},
    );
    if (minReceivedAt !== undefined) {
      mergedMetadata.received_at = minReceivedAt;
    }

    const representativeMessageId = items[0].provider_message_id;
    const consolidatedBody =
      items.length > 1
        ? `[O lead enviou ${items.length} mensagens em sequência:]\n` +
          items.map((i) => i.body ?? '').join('\n')
        : (items[0].body ?? '');

    // Read pre_persisted_ids WITHOUT draining Redis before turn execution (P0-ENG-05)
    let redisPreIds: string[] = [];
    try {
      redisPreIds = await redis.lrange(preIdsKey, 0, -1);
    } catch (e) {
      logError(`[Debounce][${dbgTag}] failed to read pre_ids (non-fatal):`, e);
    }

    const bufferPreIds = items
      .map((i) => i.metadata?.pre_message_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const prePersistedIds = [...new Set([...bufferPreIds, ...redisPreIds])];

    // 6. Evaluate billing limits
    const usage = job.usage ?? (await getCompanyUsage(job.companyId));

    // 7. Invoke AI Engine
    logDebug(
      `[Debounce][${dbgTag}] flushing batch=${items.length} attempt=${attemptCount} repId=${representativeMessageId.slice(-8)}`,
    );

    const outcome = await handleIncomingMessage(
      job.companyId,
      job.leadPhone,
      job.leadName,
      consolidatedBody,
      representativeMessageId,
      usage,
      {
        ...mergedMetadata,
        attempt_count: attemptCount,
        debounce_batch_size: items.length,
        debounce_message_ids: items.map((i) => i.provider_message_id),
        ...(prePersistedIds.length > 0 ? { pre_persisted_ids: prePersistedIds } : {}),
      },
    );

    // 8. P0-ENG-01: Respect 'requeued' outcome — preserve representative row (items[0])
    if (outcome === 'requeued') {
      const otherIds = items.slice(1).map((i) => i.provider_message_id);
      if (otherIds.length > 0) {
        await admin
          .from('message_buffer')
          .update({ flushed: true })
          .in('provider_message_id', otherIds);
      }
    } else {
      await admin
        .from('message_buffer')
        .update({ flushed: true })
        .in(
          'provider_message_id',
          items.map((i) => i.provider_message_id),
        );
    }

    // Trim only the consumed pre_ids after turn commit/requeue
    if (redisPreIds.length > 0) {
      await redis.trimPrePersistedIds(preIdsKey, redisPreIds.length);
    }
  } finally {
    await redis.releaseFlushGen(tokenKey, job.gen);
  }
}

export async function claimMessage(messageId: string): Promise<boolean> {
  const r = await redis.setNX(`ch:dedup:${messageId}`, '1', 600);

  if (r === true) return true;
  if (r === false) return false;

  // Redis off → fallback PG
  const admin = createAdminClient();
  const { error } = await admin.from('dedup_keys').insert({ provider_message_id: messageId });
  if (!error) return true;
  if (error.code === '23505') return false;
  logError('[claimMessage] CRITICAL: redis off AND pg fail', error);
  return true;
}

export async function bufferInDB(args: {
  companyId: string;
  leadPhone: string;
  leadName: string;
  body: string;
  providerMessageId: string;
  msgType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from('message_buffer').insert({
    provider_message_id: args.providerMessageId,
    company_id: args.companyId,
    lead_phone: args.leadPhone,
    lead_name: args.leadName,
    body: args.body,
    msg_type: args.msgType,
    metadata: args.metadata ?? {},
    flush_after: new Date(Date.now() + 4_000).toISOString(),
    flushed: false,
  });
}
