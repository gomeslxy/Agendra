-- Agendra Migration: 018_processed_messages_ttl
-- Objetivo: Evitar crescimento ilimitado da tabela processed_messages.
--
-- processed_messages serve apenas como deduplicação de webhook (7-day window
-- é mais que suficiente — a Meta não reenvia mensagens com mais de 24h).
-- Job roda diariamente às 3h UTC via pg_cron.

SELECT cron.schedule(
  'agendra_cron_cleanup_processed_messages',
  '0 3 * * *',
  $$
    DELETE FROM public.processed_messages
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);
