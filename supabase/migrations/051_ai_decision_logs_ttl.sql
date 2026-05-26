-- Migration 051: TTL cleanup for ai_decision_logs
-- Purge decision logs older than 30 days daily at 03:30 UTC (off-peak)

SELECT cron.schedule(
  'purge-ai-decision-logs-ttl',
  '30 3 * * *',
  $$
    DELETE FROM public.ai_decision_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
