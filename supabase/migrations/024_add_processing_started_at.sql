-- Migration 024: Adiciona controle de TTL no lock de processamento do lead
-- para evitar leads congelados permanentemente caso o worker sofra timeout ou crash.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Remove watchdog antigo se existir para evitar colisão ao reinstalar
DO $$ BEGIN
  PERFORM cron.unschedule('agendra_unlock_stale_leads');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- Job pg_cron que roda a cada 1 minuto liberando locks presos por mais de 3 minutos
SELECT cron.schedule(
  'agendra_unlock_stale_leads',
  '* * * * *',
  $$
    UPDATE public.leads
    SET is_processing = false, processing_started_at = null
    WHERE is_processing = true
      AND processing_started_at < NOW() - INTERVAL '3 minutes';
  $$
);
