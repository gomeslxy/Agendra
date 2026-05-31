-- 073_admin_dashboard_aggregations.sql
-- Server-side aggregation RPCs for the owner admin panel.
-- Replaces full-table scans previously done in app/admin/page.tsx (audit P1):
-- the page no longer pulls every message/lead row into Node memory.
--
-- All functions are SECURITY DEFINER (bypass RLS, cross-tenant by design for the
-- owner panel) and are called exclusively via the service-role key on the
-- server. EXECUTE is REVOKED from anon/authenticated so they are NOT reachable
-- through /rest/v1/rpc with the public anon key (audit hardening — see
-- migration 062 / lead_memory exposure note).

-- ── Messages per company since a cutoff ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_msgs_per_company(p_since timestamptz)
RETURNS TABLE(company_id uuid, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id, count(*)::bigint
  FROM public.messages
  WHERE created_at >= p_since
  GROUP BY company_id;
$$;

-- ── Active (non-closed) leads per company ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_active_leads_per_company()
RETURNS TABLE(company_id uuid, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id, count(*)::bigint
  FROM public.leads
  WHERE status IS DISTINCT FROM 'closed'
  GROUP BY company_id;
$$;

-- ── Last activity (latest message) per company — fixes the top-2000 bug ───────
CREATE OR REPLACE FUNCTION public.admin_last_activity_per_company()
RETURNS TABLE(company_id uuid, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id, max(created_at) AS last_at
  FROM public.messages
  GROUP BY company_id;
$$;

-- ── Tokens consumed per company since a cutoff ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_tokens_per_company(p_since timestamptz)
RETURNS TABLE(company_id uuid, tokens bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id,
         coalesce(sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)), 0)::bigint
  FROM public.ai_logs
  WHERE created_at >= p_since
  GROUP BY company_id;
$$;

-- ── Intent distribution since a cutoff ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_intent_distribution(p_since timestamptz)
RETURNS TABLE(intent text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT intent_detected AS intent, count(*)::bigint
  FROM public.ai_decision_logs
  WHERE created_at >= p_since AND intent_detected IS NOT NULL
  GROUP BY intent_detected
  ORDER BY count(*) DESC;
$$;

-- ── Provider stats with percentiles (P50/P90/P99) computed in SQL ────────────
CREATE OR REPLACE FUNCTION public.admin_provider_stats(p_since timestamptz, p_since_24h timestamptz)
RETURNS TABLE(
  provider     text,
  requests_24h bigint,
  requests_7d  bigint,
  successes_7d bigint,
  avg_latency  numeric,
  p50_ms       numeric,
  p90_ms       numeric,
  p99_ms       numeric,
  cost_7d      numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    coalesce(provider, 'gemini')                                              AS provider,
    count(*) FILTER (WHERE created_at >= p_since_24h)::bigint                 AS requests_24h,
    count(*)::bigint                                                          AS requests_7d,
    count(*) FILTER (WHERE error IS NULL)::bigint                             AS successes_7d,
    coalesce(round(avg(latency_ms)), 0)                                       AS avg_latency,
    coalesce(percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms), 0)     AS p50_ms,
    coalesce(percentile_cont(0.90) WITHIN GROUP (ORDER BY latency_ms), 0)     AS p90_ms,
    coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms), 0)     AS p99_ms,
    coalesce(sum(cost), 0)                                                    AS cost_7d
  FROM public.ai_logs
  WHERE created_at >= p_since
  GROUP BY coalesce(provider, 'gemini');
$$;

-- ── AI error timeseries (daily) for trend / spike detection (audit obs) ──────
CREATE OR REPLACE FUNCTION public.admin_ai_error_daily(p_since timestamptz)
RETURNS TABLE(day date, total bigint, errors bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('day', created_at)::date AS day,
         count(*)::bigint                     AS total,
         count(*) FILTER (WHERE error IS NOT NULL)::bigint AS errors
  FROM public.ai_logs
  WHERE created_at >= p_since
  GROUP BY 1
  ORDER BY 1;
$$;

-- ── Lock down: server-only via service role ──────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_msgs_per_company(timestamptz)',
    'admin_active_leads_per_company()',
    'admin_last_activity_per_company()',
    'admin_tokens_per_company(timestamptz)',
    'admin_intent_distribution(timestamptz)',
    'admin_provider_stats(timestamptz, timestamptz)',
    'admin_ai_error_daily(timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role;', fn);
  END LOOP;
END $$;
