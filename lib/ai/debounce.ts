import crypto from 'crypto';
import { redis } from '@/lib/infra/redis';
import { handleIncomingMessage } from './engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from "@/lib/logging";
import { qstashEnabled, scheduleDelayed } from '@/lib/infra/qstash';
import type { CompanyUsage } from '@/lib/billing/limits';
import { runWithDeadline } from './deadline';

const DEBOUNCE_MS = 4_000;
const BUF_TTL_SEC = 60;
export const FLUSH_PATH = '/api/internal/flush';

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
      await scheduleDelayed(FLUSH_PATH, job, Math.ceil(DEBOUNCE_MS / 1000));
      console.log(`[Debounce][${dbgTag}] 📨 scheduled flush via QStash (gen=${gen.slice(0, 6)}, +${DEBOUNCE_MS}ms)`);
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
  console.log(`[Debounce][${dbgTag}] ⏲️  (no QStash) waiting ${DEBOUNCE_MS}ms inline (gen=${gen.slice(0, 6)})`);
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
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

  await handleIncomingMessage(
    job.companyId, job.leadPhone, job.leadName,
    mergedBody,
    lastItem.provider_message_id,
    job.usage,
    { ...mergedMetadata, debounce_batch_size: items.length,
      debounce_message_ids: items.map((i) => i.provider_message_id) }
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
