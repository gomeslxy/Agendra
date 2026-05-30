-- Migration 055: Alinha o watchdog de locks presos ao orçamento real de um turno.
--
-- BUG corrigido: a migração 054 apertou o reaper para 2 minutos, mas o motor de IA
-- pode segurar o lock legitimamente por até TURN_BUDGET_MS (270s, ver lib/ai/deadline.ts).
-- Um turno lento (porém vivo) entre 2min e 4min30s tinha seu lock reclamado tanto pelo
-- reclaim inline (engine.ts) quanto por este pg_cron → DOIS workers processavam o mesmo
-- turno do mesmo lead em paralelo (resposta duplicada + escrita concorrente em leads).
--
-- Correção: só consideramos "preso" um lock mais velho que TURN_BUDGET_MS + margem.
-- O supervisor de deadline já libera o lock graciosamente em ~270s; qualquer lock acima
-- de 5 minutos é, portanto, de um worker genuinamente morto (crash/kill). Mantém-se
-- alinhado com STALE_LOCK_MS = TURN_BUDGET_MS + 30s no engine.ts.

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
      AND processing_started_at < NOW() - INTERVAL '5 minutes';
  $$
);
