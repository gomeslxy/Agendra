import crypto from 'crypto';
import { redis } from '@/lib/infra/redis';
import { handleIncomingMessage } from './engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { logDebug, logInfo, logError, isDebug } from "@/lib/logging";
const DEBOUNCE_MS = 4_000;
const BUF_TTL_SEC = 60;

interface Buffered {
  body: string;
  ts: number;
  provider_message_id: string;
  type: string;
  metadata?: Record<string, any>;
}

export async function bufferAndDebounce(args: {
  companyId: string;
  leadPhone: string;
  leadName: string;
  body: string;
  providerMessageId: string;
  msgType: string;
  usage?: any;
  metadata?: Record<string, any>;
}): Promise<void> {
  const bufKey = `wa:buf:${args.companyId}:${args.leadPhone}`;
  const tokenKey = `wa:bufgen:${args.companyId}:${args.leadPhone}`;
  const gen = crypto.randomBytes(8).toString('hex');

  await redis.rpush(bufKey, JSON.stringify({
    body: args.body, ts: Date.now(),
    provider_message_id: args.providerMessageId,
    type: args.msgType, metadata: args.metadata ?? {},
  } satisfies Buffered));
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

  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

  // FIX B2: outro flusher mais recente assume
  const winner = await redis.get(tokenKey);
  if (winner !== gen) return;

  const raw = await redis.lrange(bufKey, 0, -1);
  await redis.del(bufKey);
  await redis.del(tokenKey);
  if (raw.length === 0) return;

  const items: Buffered[] = raw
    .map((s) => { try { return JSON.parse(s) as Buffered; } catch { return null; } })
    .filter((x): x is Buffered => x !== null)
    .sort((a, b) => a.ts - b.ts);

  // FIX B8: merge metadata de TODAS fragmentadas (não só primeira)
  const mergedMetadata = items.reduce<Record<string, any>>(
    (acc, i) => ({ ...acc, ...(i.metadata ?? {}) }), {}
  );

  await handleIncomingMessage(
    args.companyId, args.leadPhone, args.leadName,
    items.map((i) => i.body).join('\n'),
    items[0].provider_message_id,
    args.usage,
    { ...mergedMetadata, debounce_batch_size: items.length,
      debounce_message_ids: items.map((i) => i.provider_message_id) }
  );
}

export async function claimMessage(messageId: string): Promise<boolean> {
  const r = await redis.setNX(`wa:dedup:${messageId}`, '1', 600);
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
