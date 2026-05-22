ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS human_takeover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS human_takeover_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS human_takeover_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_takeover_expiry
  ON public.leads (company_id, human_takeover_until)
  WHERE human_takeover_until IS NOT NULL;

COMMENT ON COLUMN public.leads.human_takeover_until IS
  'Timestamp em que IA reassume. NULL = sem takeover ativo.';

-- Job 1: reset puro (sem dep)
SELECT cron.schedule('reactivate-ai-after-takeover', '*/5 * * * *',
$$
UPDATE public.leads
   SET is_paused = false,
       control_mode = 'auto',
       human_takeover_at = NULL,
       human_takeover_until = NULL,
       human_takeover_by = NULL
 WHERE human_takeover_until IS NOT NULL
   AND human_takeover_until <= NOW();
$$);

-- Job 2: log em automation_events (só se tabela existe)
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
       AND control_mode = 'auto'
       AND human_takeover_at IS NULL
       AND updated_at > NOW() - INTERVAL '6 minutes';
    $job$);
  END IF;
END $$;
