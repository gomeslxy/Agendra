-- Migration 054: Aperta o watchdog de locks presos de 3min → 2min.
--
-- Contexto: o motor de IA agora também faz "inline stale-lock reclaim" na
-- aquisição do lock (threshold de 2min) para leads que voltam a falar. Este
-- pg_cron cobre o caso complementar — o lead que fica SILENCIOSO após um crash
-- do worker. Alinhamos os dois thresholds em 120s para comportamento previsível.
--
-- pg_cron roda dentro do Postgres (Supabase) — 100% grátis, sem depender dos
-- limites de cron do plano Vercel Hobby.

DO $$ BEGIN
  PERFORM cron.unschedule('agendra_unlock_stale_leads');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'agendra_unlock_stale_leads',
  '* * * * *',
  $$
    UPDATE public.leads
    SET is_processing = false, processing_started_at = null
    WHERE is_processing = true
      AND processing_started_at < NOW() - INTERVAL '2 minutes';
  $$
);
