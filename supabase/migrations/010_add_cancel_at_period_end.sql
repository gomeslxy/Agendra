-- ============================================================
-- Migration 010: Add cancel_at_period_end to companies
-- ============================================================

ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Update index to include this column for better query performance in billing logic
DROP INDEX IF EXISTS companies_billing_idx;
CREATE INDEX companies_billing_idx
  ON public.companies(id, plan_type, subscription_status, current_period_start, current_period_end, cancel_at_period_end);
