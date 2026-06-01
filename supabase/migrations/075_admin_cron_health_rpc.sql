-- 075_admin_cron_health_rpc.sql
-- Exposes pg_cron job health (last run, status, schedule, duration) to the admin panel.
-- cron.job and cron.job_run_details are in the cron schema — not accessible from
-- public by default. SECURITY DEFINER + REVOKE pattern (consistent with 062/073/074).

CREATE OR REPLACE FUNCTION public.admin_cron_job_status()
RETURNS TABLE(
  jobid        bigint,
  jobname      text,
  schedule     text,
  active       boolean,
  last_run     timestamptz,
  last_status  text,
  last_message text,
  duration_ms  numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
  SELECT
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active,
    r.start_time                                                         AS last_run,
    r.status                                                             AS last_status,
    r.return_message                                                     AS last_message,
    ROUND(EXTRACT(EPOCH FROM (r.end_time - r.start_time)) * 1000)       AS duration_ms
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, end_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) r ON true
  ORDER BY
    -- Failed jobs first so they're immediately visible
    CASE WHEN r.status = 'failed' THEN 0 ELSE 1 END,
    j.jobname;
$$;

REVOKE ALL ON FUNCTION public.admin_cron_job_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_job_status() TO service_role;
