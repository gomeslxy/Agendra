-- 072_admin_rate_limit_and_extra_capacity.sql
-- (1) Tracks admin login attempts for IP-based rate limiting (5 failures → 15min block)
-- (2) Extra leads capacity override for admin-granted extensions

CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id           SERIAL PRIMARY KEY,
  ip_address   TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time
  ON public.admin_login_attempts (ip_address, attempted_at DESC);

-- Hourly TTL: clear attempts older than 24h
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-admin-login-attempts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-admin-login-attempts',
  '0 * * * *',
  $$
    DELETE FROM public.admin_login_attempts
    WHERE attempted_at < now() - interval '24 hours';
  $$
);

-- Extra leads/capacity override so admins can extend tenant quota without plan change
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS extra_leads INT NOT NULL DEFAULT 0;
