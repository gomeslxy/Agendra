-- ============================================================
-- Agendra — OTP Codes Table
-- Stores short-lived 6-digit codes for email verification
-- and password reset. Uses RLS + TTL cleanup.
-- ============================================================

create table if not exists public.otp_codes (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  code        text not null,
  purpose     text not null check (purpose in ('signup', 'password_reset')),
  used        boolean not null default false,
  expires_at  timestamptz not null default (now() + interval '15 minutes'),
  created_at  timestamptz not null default now()
);

-- Index for fast lookup by email + purpose
create index if not exists otp_codes_email_purpose_idx
  on public.otp_codes(email, purpose);

-- RLS: nobody reads OTP codes directly (only service role via API routes)
alter table public.otp_codes enable row level security;

-- No select/insert/update/delete policies for authenticated or anon roles.
-- All access goes through service_role (admin client in API routes).

-- Grant service_role full access
grant all on public.otp_codes to service_role;

-- Cleanup function: delete expired codes (call via pg_cron or on each verification attempt)
create or replace function public.cleanup_expired_otps()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.otp_codes where expires_at < now();
$$;
