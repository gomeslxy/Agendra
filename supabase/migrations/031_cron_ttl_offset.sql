-- Migration 031: Stagger TTL pg_cron cleanup jobs to prevent CPU/lock contention at 03:00 UTC
DO $$
BEGIN
  -- Unschedule existing jobs safely
  PERFORM cron.unschedule('purge-ai-logs-ttl');
  PERFORM cron.unschedule('purge-ai-traces-ttl');
  PERFORM cron.unschedule('agendra_cron_cleanup_processed_messages');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Re-schedule processed messages cleanup to 03:00 UTC (stagger point 1)
SELECT cron.schedule(
  'agendra_cron_cleanup_processed_messages',
  '0 3 * * *',
  $$
    DELETE FROM public.processed_messages
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);

-- Re-schedule AI logs purge to 03:05 UTC (stagger point 2)
SELECT cron.schedule(
  'purge-ai-logs-ttl',
  '5 3 * * *',
  $$
    DELETE FROM public.ai_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);

-- Re-schedule AI traces purge to 03:10 UTC (stagger point 3)
SELECT cron.schedule(
  'purge-ai-traces-ttl',
  '10 3 * * *',
  $$
    DELETE FROM public.ai_traces
    WHERE created_at < NOW() - INTERVAL '180 days';
  $$
);
