/**
 * /api/cron/flush-buffer — high-frequency drain of the SQL message_buffer fallback.
 *
 * Called by pg_cron `agendra_flush_buffer` every minute via pg_net (Bearer CRON_SECRET).
 * Before this route existed, fallback-buffered messages waited for the once-daily
 * morning/nightly crons → up to ~12h reply latency. Now capped at ~1 min.
 *
 * Self-limits via a wall-clock budget so a large backlog spans multiple runs instead
 * of overrunning the function. Idempotent vs. the daily sweeps thanks to engine-level
 * processed_messages dedup.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { flushMessageBuffer } from '@/lib/ai/buffer-flush';

export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    // Smaller batch + ~4min budget: this runs every minute, so it favours low latency
    // and lets a backlog drain across consecutive runs rather than risking a timeout.
    const result = await flushMessageBuffer(admin, { rowLimit: 30, timeBudgetMs: 240_000 });
    if (result.flushed > 0 || result.aborted) {
      console.log('[cron/flush-buffer]', result);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[cron/flush-buffer] failed:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'flush failed' }, { status: 500 });
  }
}
