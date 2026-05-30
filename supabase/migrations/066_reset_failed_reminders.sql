-- Agendra Migration: 047_reset_failed_reminders
-- Objetivo: Recuperar reminders presos em status='failed' cujos eventos ainda não ocorreram.
--
-- Contexto: O endpoint /api/cron/reminders estava ausente desde o início, então o pg_cron
-- que deveria processar reminders a cada 5min retornava 404 silenciosamente.
-- Reminders que falharam por erros transitórios ficaram presos em 'failed'.
-- Esta migration reseta esses reminders para 'pending' para que sejam reprocessados.
--
-- Seguro rodar múltiplas vezes (idempotente por natureza do filtro de status).

UPDATE public.reminders r
SET
  status     = 'pending',
  error_log  = NULL,
  updated_at = NOW()
FROM public.events e
WHERE r.event_id = e.id
  AND r.status   = 'failed'
  AND e.start_time > NOW()
  AND e.status NOT IN ('cancelled', 'rescheduled');
