import crypto from 'crypto';
import { redis } from '@/lib/infra/redis';
import { handleIncomingMessage } from './engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from "@/lib/logging";
import { qstashEnabled, scheduleDelayed } from '@/lib/infra/qstash';
import type { CompanyUsage } from '@/lib/billing/limits';
import { runWithDeadline } from './deadline';

// Adaptive debounce: mensagens curtas e sem pontuação final costumam ser
// fragmentos de um burst (lead digitando em várias bolhas) → espera mais longa
// para consolidar. Frases completas respondem quase imediatamente. Reduz a
// latência percebida no caso comum sem perder o merge de mensagens picotadas.
//
// NOTA DE LATÊNCIA: o agendamento de prod usa QStash, cujo `delay` é em SEGUNDOS
// inteiros (Math.ceil em scheduleDelayed). Por isso os valores são escolhidos no
// limite do segundo: FAST=1000 → ceil=1s (era 1200 → ceil=2s, +1s desperdiçado);
// BURST=2500 → ceil=3s (era 4000 → ceil=4s). O período de silêncio é medido APÓS
// a última bolha (gen-token reagenda a cada mensagem), então 2.5s ainda captura
// com folga o intervalo humano entre bolhas (~0.5-2s) sem perder o merge.
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

interface Buffered {
  body: string;
  ts: number;
  provider_message_id: string;
  type: string;
  metadata?: Record<string, any>;
}

/** Payload QStash delivers to the flush endpoint after the debounce delay. */
export interface FlushJob {
  companyId: string;
  leadPhone: string;
  leadName: string;
  gen: string;
  usage?: CompanyUsage;
}

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
  const bufKey = `ch:buf:${args.companyId}:${args.leadPhone}`;
  const tokenKey = `ch:bufgen:${args.companyId}:${args.leadPhone}`;
  const gen = crypto.randomBytes(8).toString('hex');

  // Guard the buffer write: if rpush fails (Redis blip / timeout) it returns null.
  // Without this guard the code would still schedule a flush whose buffer is empty
  // → the message is silently lost ("empty buffer at flush"). On a failed push we
  // divert straight to the durable DB buffer (drained within ~1min by pg_cron).
  const pushed = await redis.rpush(bufKey, JSON.stringify({
    body: args.body, ts: Date.now(),
    provider_message_id: args.providerMessageId,
    type: args.msgType, metadata: args.metadata ?? {},
  } satisfies Buffered));
  if (pushed === null) {
    logError('[debounce] Redis rpush failed — diverting to DB buffer fallback');
    await bufferInDB({
      companyId: args.companyId, leadPhone: args.leadPhone, leadName: args.leadName,
      body: args.body, providerMessageId: args.providerMessageId,
      msgType: args.msgType, metadata: args.metadata,
    });
    return;
  }
  await redis.expire(bufKey, BUF_TTL_SEC);

  let okSet: boolean | null = null;
  try {
    okSet = await redis.set(tokenKey, gen, BUF_TTL_SEC);
  } catch (e) {
    logError('[debounce] Redis error on set, falling back to DB buffer:', e);
    // Fallback to DB buffering
    await bufferInDB({
      companyId: args.companyId,
      leadPhone: args.leadPhone,
      leadName: args.leadName,
      body: args.body,
      providerMessageId: args.providerMessageId,
      msgType: args.msgType,
      metadata: args.metadata,
    });
    return; // exit early, DB will be processed later by cron
  }
  if (okSet === null) {
    console.error('[debounce] Redis returned null, falling back to DB buffer');
    await bufferInDB({
      companyId: args.companyId,
      leadPhone: args.leadPhone,
      leadName: args.leadName,
      body: args.body,
      providerMessageId: args.providerMessageId,
      msgType: args.msgType,
      metadata: args.metadata,
    });
    return;
  }

  const dbgTag = `${args.companyId.slice(0, 6)}:${args.leadPhone.slice(-4)}`;
  const delayMs = debounceDelayFor(args.body);

  // Pre-save the user message to the messages table immediately so the inbox
  // shows it in real-time without waiting for the debounce delay + AI turn.
  // The pre-saved ID is stored in Redis and passed to the engine at flush time
  // so it can skip the duplicate insert and exclude it from the AI history window.
  // Non-fatal: if the lead doesn't exist yet (new lead) or any DB error occurs,
  // the engine will save the message normally on flush.
  const preIdsKey = `ch:pre_ids:${args.companyId}:${args.leadPhone}`;
  try {
    const admin = createAdminClient();
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
          content: args.body,
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
    logError('[debounce] pre-save failed (non-fatal, engine will save on flush):', e);
  }

  const job: FlushJob = {
    companyId: args.companyId,
    leadPhone: args.leadPhone,
    leadName: args.leadName,
    gen,
    usage: args.usage,
  };

  // Serverless-native debounce: schedule a delayed flush via QStash instead of
  // blocking the instance with setTimeout. Each new burst message overwrites the
  // gen token (above) and schedules its own delayed flush; only the delivery
  // whose gen still matches the token at fire time wins — debounce + race-safe.
  if (qstashEnabled()) {
    try {
      await scheduleDelayed(FLUSH_PATH, job, Math.ceil(delayMs / 1000));
      console.log(`[Debounce][${dbgTag}] 📨 scheduled flush via QStash (gen=${gen.slice(0, 6)}, +${delayMs}ms)`);
    } catch (e) {
      logError('[debounce] QStash publish failed, falling back to DB buffer:', e);
      await bufferInDB({
        companyId: args.companyId, leadPhone: args.leadPhone, leadName: args.leadName,
        body: args.body, providerMessageId: args.providerMessageId,
        msgType: args.msgType, metadata: args.metadata,
      });
    }
    return;
  }

  // Dev/local fallback (no QStash configured): inline wait then flush directly.
  console.log(`[Debounce][${dbgTag}] ⏲️  (no QStash) waiting ${delayMs}ms inline (gen=${gen.slice(0, 6)})`);
  await new Promise((r) => setTimeout(r, delayMs));
  await runWithDeadline(() => flushBuffer(job));
}

/**
 * Consolidates the buffered burst into one merged message and hands it to the
 * engine. Idempotent / race-safe via the gen token: only the caller whose gen
 * still owns the token proceeds; everyone else is a no-op. Invoked either by the
 * QStash flush endpoint (production) or inline (dev).
 */
export async function flushBuffer(job: FlushJob): Promise<void> {
  const bufKey = `ch:buf:${job.companyId}:${job.leadPhone}`;
  const tokenKey = `ch:bufgen:${job.companyId}:${job.leadPhone}`;
  const dbgTag = `${job.companyId.slice(0, 6)}:${job.leadPhone.slice(-4)}`;

  // Atomic claim-and-drain: single Lua script atomically checks the gen token,
  // drains the buffer, and deletes both keys. Eliminates the TOCTOU race where
  // two concurrent QStash deliveries (retry storm) both pass a non-atomic GET
  // guard and double-fire the engine for the same lead turn.
  //
  // claimAndFlush returns null ONLY on a genuine token mismatch (superseded) and
  // THROWS when Redis is unreachable. On a throw we must NOT fabricate a recovered
  // placeholder (that used to send "(recovered from flush)" to the lead) nor drop
  // the message: we rethrow so the flush route returns 500 and QStash retries —
  // the burst stays in Redis for the retry to drain, and the gen-token guard +
  // processed_messages dedup keep the retry idempotent.
  let raw: string[] | null;
  try {
    raw = await redis.claimAndFlush(tokenKey, bufKey, job.gen);
  } catch (e) {
    logError(`[Debounce][${dbgTag}] Redis unreachable during flush — rethrowing for QStash retry:`, e);
    throw e;
  }

  if (raw === null) {
    console.log(`[Debounce][${dbgTag}] 🪂 superseded by newer flusher, exiting (gen=${job.gen.slice(0, 6)})`);
    return;
  }
  if (raw.length === 0) {
    console.warn(`[Debounce][${dbgTag}] ⚠️  empty buffer at flush — race lost`);
    return;
  }

  const items: Buffered[] = raw
    .map((s) => { try { return JSON.parse(s) as Buffered; } catch { return null; } })
    .filter((x): x is Buffered => x !== null)
    .sort((a, b) => a.ts - b.ts);

  // FIX B8: merge metadata de TODAS fragmentadas (não só primeira)
  const mergedMetadata = items.reduce<Record<string, any>>(
    (acc, i) => ({ ...acc, ...(i.metadata ?? {}) }), {}
  );

  const lastItem = items[items.length - 1];
  console.log(`[Debounce][${dbgTag}] 🚦 flushing batch=${items.length} lastMsgId=${lastItem.provider_message_id.slice(-8)}`);

  const mergedBody = items.length > 1
    ? `[O lead enviou ${items.length} mensagens em sequência:]\n` + items.map((i) => i.body).join('\n')
    : items[0].body;

  // Drain pre-persisted IDs so the engine can skip duplicate inserts and
  // exclude those messages from the AI history window for this turn.
  const preIdsKey = `ch:pre_ids:${job.companyId}:${job.leadPhone}`;
  let prePersistedIds: string[] = [];
  try {
    prePersistedIds = await redis.lrange(preIdsKey, 0, -1);
    if (prePersistedIds.length > 0) await redis.del(preIdsKey);
  } catch (e) {
    logError(`[Debounce][${dbgTag}] failed to drain pre_ids (non-fatal):`, e);
  }

  await handleIncomingMessage(
    job.companyId, job.leadPhone, job.leadName,
    mergedBody,
    lastItem.provider_message_id,
    job.usage,
    {
      ...mergedMetadata,
      debounce_batch_size: items.length,
      debounce_message_ids: items.map((i) => i.provider_message_id),
      ...(prePersistedIds.length > 0 ? { pre_persisted_ids: prePersistedIds } : {}),
    }
  );
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
  return true; // não perder msg em falha total
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
  });
}
