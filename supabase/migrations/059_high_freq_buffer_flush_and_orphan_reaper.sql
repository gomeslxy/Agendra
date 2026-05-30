-- Migration 059: High-frequency message_buffer drain + processed_messages orphan reaper.
--
-- ── RC1 (latency): the SQL fallback `message_buffer` was only drained by the once-daily
--    morning(11:00 UTC)/nightly(23:00 UTC) crons. Any message that took the fallback path
--    (Redis timeout/null or QStash publish failure on the realtime debounce) waited up to
--    ~12h for a reply. Production evidence: msgs buffered 02:19–02:31 UTC answered 11:06 UTC
--    (~8.5h); 14-day max reply latency = 51016s (≈14h). We add a 1-minute pg_cron that calls
--    the new /api/cron/flush-buffer route, capping fallback latency at ~1 min.
--
-- ── RC2 (orphans): the stale-lock reaper (migration 055, job releases leads.is_processing)
--    never touches `processed_messages`. A turn that inserts processed_messages='processing'
--    but dies before completing/erroring stays 'processing' forever. Production evidence:
--    a row stuck 27h. We reap rows stuck in 'processing' beyond the max turn budget.
--    Threshold 6min > TURN_BUDGET_MS (270s) + cleanup margin, so live turns are never killed.

-- ─── 1. High-frequency buffer flush (every minute) ───────────────────────────
DO $$ BEGIN
  PERFORM cron.unschedule('agendra_flush_buffer')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agendra_flush_buffer');
END $$;

SELECT cron.schedule(
  'agendra_flush_buffer',
  '* * * * *',
  $$SELECT public.agendra_call_cron('/api/cron/flush-buffer');$$
);

-- ─── 2. Orphan processed_messages reaper (every minute) ──────────────────────
DO $$ BEGIN
  PERFORM cron.unschedule('agendra_reap_orphan_processed')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agendra_reap_orphan_processed');
END $$;

SELECT cron.schedule(
  'agendra_reap_orphan_processed',
  '* * * * *',
  $$
    UPDATE public.processed_messages
       SET status = 'error',
           error_message = COALESCE(error_message, 'reaped: stuck in processing > 6min')
     WHERE status = 'processing'
       AND created_at < NOW() - INTERVAL '6 minutes';
  $$
);

-- ─── 3. One-time cleanup of the historical orphans observed in production ─────
UPDATE public.processed_messages
   SET status = 'error',
       error_message = COALESCE(error_message, 'reaped: pre-existing orphan (migration 059)')
 WHERE status = 'processing'
   AND created_at < NOW() - INTERVAL '6 minutes';
