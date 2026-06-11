import crypto from 'crypto';
import { redis } from '@/lib/infra/redis';
import { handleIncomingMessage } from './engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from "@/lib/logging";
import { qstashEnabled, scheduleDelayed } from '@/lib/infra/qstash';
import type { CompanyUsage } from '@/lib/billing/limits';
import { getCompanyUsage } from '@/lib/billing/limits';
import { runWithDeadline } from './deadline';

const DEBOUNCE_FAST_MS = 1_000;
const DEBOUNCE_BURST_MS = 2_500;
const BUF_TTL_SEC = 60;
export const FLUSH_PATH = '/api/internal/flush';

/** Heurística de fragmentação: msg curta que não termina em pontuação. */
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
  metadata?: Record<string, any>;
}): Promise<void> {
  const dbgTag = `${args.companyId.slice(0, 6)}:${args.leadPhone.slice(-4)}`;
  const delayMs = debounceDelayFor(args.body);
  const gen = crypto.randomBytes(8).toString('hex');
  const tokenKey = `ch:bufgen:${args.companyId}:${args.leadPhone}`;

  const admin = createAdminClient();

  // 1. Durably insert the message into PostgreSQL message_buffer
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
      attempt_count: 1, // First attempt
    },
    flush_after: new Date(Date.now() + delayMs).toISOString(),
    flushed: false,
  });

  if (error) {
    logError(`[debounce][${dbgTag}] PostgreSQL buffer insert failed: ${error.message}`);
    throw new Error(`Failed to buffer message in DB: ${error.message}`);
  }

  // 2. Set the gen token in Redis to enable debounce comparison on flush
  try {
    await redis.set(tokenKey, gen, BUF_TTL_SEC);
  } catch (e) {
    logError(`[debounce][${dbgTag}] Redis gen token set failed (non-fatal):`, e);
  }

  // 3. Pre-save to messages table for real-time inbox view
  const preIdsKey = `ch:pre_ids:${args.companyId}:${args.leadPhone}`;
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
        await redis.rpush(preIdsKey, ins.id);
        await redis.expire(preIdsKey, BUF_TTL_SEC);
        console.log(`[Debounce][${dbgTag}] 💾 pre-saved message ${ins.id.slice(0, 8)} for real-time inbox`);
      }
    }
  } catch (e) {
    logError(`[debounce][${dbgTag}] pre-save failed (non-fatal):`, e);
  }

  const job: FlushJob = {
    companyId: args.companyId,
    leadPhone: args.leadPhone,
    leadName: args.leadName,
    gen,
  };

  // 4. Schedule background flush via QStash
  if (qstashEnabled()) {
    try {
      await scheduleDelayed(FLUSH_PATH, job, Math.ceil(delayMs / 1000));
      console.log(`[Debounce][${dbgTag}] 📨 scheduled flush via QStash (gen=${gen.slice(0, 6)}, +${delayMs}ms)`);
    } catch (e) {
      logError(`[debounce][${dbgTag}] QStash schedule failed, falling back to local setTimeout:`, e);
      // Fallback: spawn background task locally
      setTimeout(async () => {
        try {
          await runWithDeadline(() => flushBuffer(job));
        } catch (err) {
          logError(`[debounce][${dbgTag}] local fallback flush run failed:`, err);
        }
      }, delayMs);
    }
  } else {
    // Local development: wait inline then flush
    console.log(`[Debounce][${dbgTag}] ⏲️  (no QStash) scheduling local setTimeout (+${delayMs}ms, gen=${gen.slice(0, 6)})`);
    setTimeout(async () => {
      try {
        await runWithDeadline(() => flushBuffer(job));
      } catch (err) {
        logError(`[debounce][${dbgTag}] local setTimeout flush run failed:`, err);
      }
    }, delayMs);
  }
}

/**
 * Backward-compatible wrapper. Calls bufferAndQueueMessage.
 */
export async function bufferAndDebounce(args: {
  companyId: string;
  leadPhone: string;
  leadName: string;
  body: string;
  providerMessageId: string;
  msgType: string;
  usage?: CompanyUsage;
  metadata?: Record<string, any>;
}): Promise<void> {
  return bufferAndQueueMessage(args);
}

/**
 * Consolidates the buffered database messages for a specific lead, transcribes/downloads
 * media attachments in the background, and executes the AI turn.
 */
export async function flushBuffer(job: FlushJob): Promise<void> {
  const tokenKey = `ch:bufgen:${job.companyId}:${job.leadPhone}`;
  const dbgTag = `${job.companyId.slice(0, 6)}:${job.leadPhone.slice(-4)}`;

  // 1. Debounce Guard: verify if we are the winning delivery
  let currentGen: string | null = null;
  try {
    currentGen = await redis.get(tokenKey);
  } catch (e) {
    logError(`[Debounce][${dbgTag}] Redis token get failed (proceeding):`, e);
  }

  if (currentGen && currentGen !== job.gen) {
    console.log(`[Debounce][${dbgTag}] 🪂 superseded by newer flusher, exiting (gen=${job.gen.slice(0, 6)})`);
    return;
  }

  // 2. Fetch all unflushed buffer messages for this lead
  const admin = createAdminClient();
  const { data: rawItems, error } = await admin
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

  if (!rawItems || rawItems.length === 0) {
    console.warn(`[Debounce][${dbgTag}] ⚠️ empty buffer at SQL flush`);
    return;
  }

  // Determine the attempt count (default 1)
  const attemptCount = Number(rawItems[0].metadata?.attempt_count ?? 1);

  // 3. Resolve Channel for media routing
  const channelProvider = rawItems[0].metadata?.channelProvider || 'whatsapp';
  const channelId = rawItems[0].metadata?.channelId;

  let channel: any = null;
  if (channelId) {
    const { data } = await admin
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();
    channel = data;
    if (channel && !channel.access_token && channel.access_token_secret_id) {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: channel.id });
      channel.access_token = tokenData ?? null;
    }
  }

  // 4. Download and transcribe media attachments in background
  const { routeMedia } = await import('@/lib/ai/media-router');
  const items: any[] = [];
  for (const item of rawItems) {
    let text = item.body || '';
    let itemMetadata = (item.metadata as Record<string, any>) ?? {};

    // Check if the message is media and has not been transcribed yet
    const isMedia = item.msg_type !== 'text';
    const hasMediaMetadata = !!itemMetadata.mediaId || !!itemMetadata.mediaUrl;
    if (isMedia && channel?.access_token && !text && hasMediaMetadata) {
      console.log(`[Debounce][${dbgTag}] 🎙️ transcribing media message in background (type=${item.msg_type})`);
      try {
        const msgForRouting = {
          type: item.msg_type,
          providerMessageId: item.provider_message_id,
          senderIdentifier: item.lead_phone,
          senderName: item.lead_name,
          body: item.body,
          metadata: itemMetadata,
        } as any;
        const routed = await routeMedia(msgForRouting, channel.access_token, item.provider_message_id);
        text = routed.body || '';
        itemMetadata = { ...itemMetadata, ...routed.metadata };
      } catch (mediaErr: any) {
        logError(`[Debounce][${dbgTag}] Background media routing failed:`, mediaErr?.message);
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
  const mergedMetadata = items.reduce<Record<string, any>>(
    (acc, i) => ({ ...acc, ...(i.metadata ?? {}) }), {}
  );
  const lastItem = items[items.length - 1];
  const consolidatedBody = items.length > 1
    ? `[O lead enviou ${items.length} mensagens em sequência:]\n` + items.map((i) => i.body).join('\n')
    : items[0].body;

  // Drain pre-persisted messages from Redis
  const preIdsKey = `ch:pre_ids:${job.companyId}:${job.leadPhone}`;
  let prePersistedIds: string[] = [];
  try {
    prePersistedIds = await redis.lrange(preIdsKey, 0, -1);
    if (prePersistedIds.length > 0) await redis.del(preIdsKey);
  } catch (e) {
    logError(`[Debounce][${dbgTag}] failed to drain pre_ids (non-fatal):`, e);
  }

  // 6. Evaluate billing limits
  const usage = job.usage ?? await getCompanyUsage(job.companyId);

  // 7. Invoke AI Engine
  console.log(`[Debounce][${dbgTag}] 🚦 flushing batch=${items.length} attempt=${attemptCount} lastMsgId=${lastItem.provider_message_id.slice(-8)}`);
  
  await handleIncomingMessage(
    job.companyId,
    job.leadPhone,
    job.leadName,
    consolidatedBody,
    lastItem.provider_message_id,
    usage,
    {
      ...mergedMetadata,
      attempt_count: attemptCount,
      debounce_batch_size: items.length,
      debounce_message_ids: items.map((i) => i.provider_message_id),
      ...(prePersistedIds.length > 0 ? { pre_persisted_ids: prePersistedIds } : {}),
    }
  );

  // 8. Success: mark rows as flushed and clear Redis gen token
  await admin
    .from('message_buffer')
    .update({ flushed: true })
    .in('provider_message_id', items.map((i) => i.provider_message_id));

  try {
    await redis.del(tokenKey);
  } catch (e) {
    logError(`[Debounce][${dbgTag}] failed to clear Redis gen token:`, e);
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
  if (error.code === '23505') return false; // unique violation = duplicata
  console.error('[claimMessage] CRITICAL: redis off AND pg fail', error);
  return true;
}

export async function bufferInDB(args: {
  companyId: string;
  leadPhone: string;
  leadName: string;
  body: string;
  providerMessageId: string;
  msgType: string;
  metadata?: Record<string, any>;
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
