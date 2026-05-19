-- Migration 021: TTL cleanup for ai_logs and ai_traces
-- ai_logs > 90 days
-- ai_traces > 180 days

SELECT cron.schedule(
  'purge-ai-logs-ttl',
  '0 3 * * *',  -- daily at 03:00 UTC (off-peak)
  $$
    DELETE FROM public.ai_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);

SELECT cron.schedule(
  'purge-ai-traces-ttl',
  '0 3 * * *',
  $$
    DELETE FROM public.ai_traces
    WHERE created_at < NOW() - INTERVAL '180 days';
  $$
);
