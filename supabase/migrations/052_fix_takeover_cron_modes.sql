-- Migration 052: Corrigir modos de controle inválidos nas tarefas cron de reativação de takeover.
-- O check constraint na tabela `leads` exige 'autonomous', mas a migration 038 agendou com 'auto'.

-- 1. Unschedule das duas tarefas antigas
SELECT cron.unschedule('reactivate-ai-after-takeover');
SELECT cron.unschedule('log-takeover-reactivations');

-- 2. Re-agendamento do Job 1: reativação automática de leads expirados
SELECT cron.schedule('reactivate-ai-after-takeover', '*/5 * * * *',
$$
UPDATE public.leads
   SET is_paused = false,
       control_mode = 'autonomous',
       human_takeover_at = NULL,
       human_takeover_until = NULL,
       human_takeover_by = NULL
 WHERE human_takeover_until IS NOT NULL
   AND human_takeover_until <= NOW();
$$);

-- 3. Re-agendamento do Job 2: log em automation_events (só se a tabela existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='automation_events') THEN
    PERFORM cron.schedule('log-takeover-reactivations', '*/5 * * * *',
    $job$
    INSERT INTO public.automation_events (company_id, lead_id, type, detail, payload)
    SELECT company_id, id, 'ai_resumed_after_takeover',
           'IA reativada por expiração',
           jsonb_build_object('at', NOW())
      FROM public.leads
     WHERE is_paused = false
       AND control_mode = 'autonomous'
       AND human_takeover_at IS NULL
       AND updated_at > NOW() - INTERVAL '6 minutes';
    $job$);
  END IF;
END $$;
