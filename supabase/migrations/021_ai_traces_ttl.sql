-- Migration 019: TTL cleanup for ai_traces (purge rows older than 90 days)
-- Mirrors the pattern from migration 018 (processed_messages TTL).
-- ai_traces stores full request/response payloads — unbounded growth is a
-- privacy and storage risk. 90 days retains enough history for debugging.

SELECT cron.schedule(
  'purge-ai-traces-ttl',
  '0 3 * * *',  -- daily at 03:00 UTC (off-peak)
  $$
    DELETE FROM public.ai_traces
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);

-- Also purge ai_logs older than 180 days (less sensitive, longer retention useful for cost analytics)
SELECT cron.schedule(
  'purge-ai-logs-ttl',
  '0 3 * * *',
  $$
    DELETE FROM public.ai_logs
    WHERE created_at < NOW() - INTERVAL '180 days';
  $$
);
