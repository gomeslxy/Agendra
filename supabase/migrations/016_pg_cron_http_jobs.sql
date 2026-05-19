-- Agendra Migration: 016_pg_cron_http_jobs
-- Objetivo: Disparar os crons internos via pg_cron + pg_net (HTTP)
--   já que o plano gratuito da Vercel limita Cron Jobs a 1 execução diária.
--
-- Pré-requisitos:
--   1. Vault secrets cadastrados (em Supabase Dashboard → Project Settings → Vault):
--        - agendra_base_url   (ex: https://www.agendra.site)
--        - agendra_cron_secret (mesmo valor de CRON_SECRET em Vercel)
--   2. Extensões pg_cron e pg_net habilitadas (feito nesta migration).

-- ─── 1. Extensões ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 2. Helper: dispara GET autenticado pra rota interna ─────────────────────
CREATE OR REPLACE FUNCTION public.agendra_call_cron(route TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base_url    TEXT;
  cron_secret TEXT;
  req_id      BIGINT;
BEGIN
  -- Lê os segredos do Vault (decrypted_secrets é view do supabase_vault).
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'agendra_base_url' LIMIT 1;

  SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'agendra_cron_secret' LIMIT 1;

  IF base_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING '[agendra_call_cron] Vault secrets agendra_base_url ou agendra_cron_secret ausentes';
    RETURN NULL;
  END IF;

  SELECT net.http_get(
    url     := base_url || route,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 30000
  ) INTO req_id;

  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agendra_call_cron(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agendra_call_cron(TEXT) TO postgres;

-- ─── 3. Limpa schedules antigos (idempotente) ────────────────────────────────
DO $$
DECLARE
  j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'agendra_cron_reminders',
    'agendra_cron_followup',
    'agendra_cron_gcal_sync',
    'agendra_cron_check_channels',
    'agendra_cron_morning'
  ] LOOP
    PERFORM cron.unschedule(j)
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
  END LOOP;
END $$;

-- ─── 4. Schedules ────────────────────────────────────────────────────────────
-- Lembretes: a cada 5 min (crítico — clientes esperam horário exato)
SELECT cron.schedule(
  'agendra_cron_reminders',
  '*/5 * * * *',
  $$SELECT public.agendra_call_cron('/api/cron/reminders');$$
);

-- Follow-up: hora cheia
SELECT cron.schedule(
  'agendra_cron_followup',
  '0 * * * *',
  $$SELECT public.agendra_call_cron('/api/cron/followup');$$
);

-- GCal sync: cada 30 min
SELECT cron.schedule(
  'agendra_cron_gcal_sync',
  '*/30 * * * *',
  $$SELECT public.agendra_call_cron('/api/cron/gcal-sync');$$
);

-- Health-check canais: minuto 15 de cada hora
SELECT cron.schedule(
  'agendra_cron_check_channels',
  '15 * * * *',
  $$SELECT public.agendra_call_cron('/api/cron/check-channels');$$
);

-- Morning report: 11:00 UTC (Vercel free só comporta 1 cron diário, e ficamos com o nightly lá)
SELECT cron.schedule(
  'agendra_cron_morning',
  '0 11 * * *',
  $$SELECT public.agendra_call_cron('/api/cron/morning');$$
);

-- ─── 5. Verificação ──────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.agendra_call_cron(TEXT) IS
  'Dispara rota interna /api/cron/* via pg_net com Bearer do Vault. Usado pelos jobs pg_cron.';
