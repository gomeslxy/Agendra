-- supabase/migrations/005_onboarding.sql
-- Onboarding state machine for companies (tenants)
-- Run after 004_billing_limits.sql

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started','in_progress','completed','needs_review')),
  ADD COLUMN IF NOT EXISTS onboarding_step   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_data   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_applied_config JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS companies_onboarding_status_idx
  ON public.companies(onboarding_status);
