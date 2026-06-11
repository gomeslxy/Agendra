/**
 * message_buffer drain — shared helper.
 *
 * `message_buffer` is the durable SQL fallback used when the realtime debounce
 * path (Redis buffer + QStash delayed flush) is unavailable for a given message
 * (Redis timeout/null, or a QStash publish failure). Rows land here so the lead's
 * message is NEVER lost.
 *
 * Historically this table was only drained by the once-daily `morning`/`nightly`
 * Vercel crons, so any message that took the fallback path waited up to ~12h for a
 * reply (observed in production: msgs buffered at 02:19–02:31 UTC answered at 11:06).
 * It is now also drained by a 1-minute pg_cron (`agendra_flush_buffer` →
 * /api/cron/flush-buffer), capping fallback latency at ~1 min. This helper is the
 * single implementation shared by all three callers.
 *
 * Idempotency: each consolidated group is handed to the engine with the group's
 * representative provider_message_id. The engine's `processed_messages` PK-conflict
 * dedup makes concurrent drains (1-min job overlapping a daily sweep) a no-op for an
 * already-processed group — no duplicate reply. `flushed` is flipped to true only
 * AFTER a successful turn, so a failed turn is retried on the next drain.
 */
import { handleIncomingMessage } from './engine';
import { getCompanyUsage } from '@/lib/billing/limits';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export interface FlushBufferResult {
  flushed: number;
  groups: number;
  aborted: boolean;
}

export interface FlushBufferOptions {
  /** Max rows to pull per drain (default 100). The fast 1-min job uses a smaller batch. */
  rowLimit?: number;
  /** Stop starting new groups once this much wall-clock has elapsed (protects maxDuration). */
  timeBudgetMs?: number;
}

/**
 * Drains pending `message_buffer` rows: groups them by (company, lead), consolidates
 * each group into one merged turn, and replays it through the engine.
 */
export async function flushMessageBuffer(
  admin: Admin,
  opts: FlushBufferOptions = {},
): Promise<FlushBufferResult> {
  const rowLimit = opts.rowLimit ?? 100;
  const timeBudgetMs = opts.timeBudgetMs ?? Number.POSITIVE_INFINITY;
  const startedAt = Date.now();

  const { data: rows } = await admin
    .from('message_buffer')
    .select('*')
    .eq('flushed', false)
    .lte('flush_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(rowLimit);

  if (!rows?.length) {
    return { flushed: 0, groups: 0, aborted: false };
  }

  // Group consecutive messages from the same lead so a burst becomes one turn.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.company_id}:${r.lead_phone}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  let flushed = 0;
  let aborted = false;

  for (const items of groups.values()) {
    // Time guard: never blow past the function budget; remaining rows wait for the
    // next drain (≤1 min away on the fast job). Cheap to resume — they stay unflushed.
    if (Date.now() - startedAt > timeBudgetMs) {
      aborted = true;
      break;
    }

    try {
      const usage = await getCompanyUsage(items[0].company_id);
      const consolidated = items.map((i) => i.body).join('\n');
      const mergedMetadata = items.reduce(
        (acc, i) => ({ ...acc, ...((i.metadata as Record<string, any>) ?? {}) }),
        {} as Record<string, any>,
      );

      const outcome = await handleIncomingMessage(
        items[0].company_id,
        items[0].lead_phone,
        items[0].lead_name ?? '',
        consolidated,
        items[0].provider_message_id,
        usage,
        { ...mergedMetadata, debounce_batch_size: items.length, via_sql_fallback: true },
      );

      if (outcome === 'requeued') {
        // Lock contention: the engine re-armed the consolidated turn in this same
        // table under the group's representative id (items[0]). Mark only the
        // OTHER rows flushed — their content lives inside the re-armed merged
        // body. Flipping the representative row here would clobber the requeue.
        const otherIds = items.slice(1).map((i) => i.provider_message_id);
        if (otherIds.length > 0) {
          await admin
            .from('message_buffer')
            .update({ flushed: true })
            .in('provider_message_id', otherIds);
        }
        flushed += otherIds.length;
        continue;
      }

      await admin
        .from('message_buffer')
        .update({ flushed: true })
        .in('provider_message_id', items.map((i) => i.provider_message_id));
      flushed += items.length;
    } catch (err: any) {
      console.error('[flush-buffer] group error:', err?.message ?? err);
    }
  }

  return { flushed, groups: groups.size, aborted };
}
