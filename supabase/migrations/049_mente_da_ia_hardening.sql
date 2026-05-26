-- 049_mente_da_ia_hardening.sql
-- Fix Mente da IA (Explainability) feature regression:
--   1) leads.last_sentiment is TEXT with CHECK enum but engine writes FLOAT (silent fail)
--   2) leads.last_sentiment_at column never created (migration 035 no-op because col already existed)
--   3) Replace TEXT enum constraint with NUMERIC(3,2) range so float scores persist
--   4) Add helpful index for analytics ordering
--
-- Strategy:
--   - Drop CHECK constraint that pins last_sentiment to discrete labels
--   - Rename old TEXT column to last_sentiment_label (keeps any pre-existing enum data)
--   - Add new NUMERIC column last_sentiment to receive float score (-1..1)
--   - Add last_sentiment_at TIMESTAMPTZ
--   - Backfill nothing (old data was already inconsistent)

BEGIN;

-- 1. Drop the enum CHECK constraint (was blocking float writes silently via supabase-js error swallowing)
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_last_sentiment_check;

-- 2. Rename old column so we keep historical enum values for forensic purposes
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='leads' AND column_name='last_sentiment';

  IF v_data_type = 'text' THEN
    ALTER TABLE public.leads RENAME COLUMN last_sentiment TO last_sentiment_label;
  END IF;
END $$;

-- 3. Add new NUMERIC column (idempotent — no-op if migration 035 already ran on fresh DBs)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_sentiment NUMERIC(3,2);

-- 4. Add timestamp column
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_sentiment_at TIMESTAMPTZ;

-- 5. Index ai_decision_logs for the (company_id, created_at DESC) listing pattern used by /settings
CREATE INDEX IF NOT EXISTS ai_decision_logs_company_created_idx
  ON public.ai_decision_logs (company_id, created_at DESC);

-- 6. Optional: index leads sentiment for analytics queries
CREATE INDEX IF NOT EXISTS idx_leads_sentiment
  ON public.leads (company_id, last_sentiment DESC NULLS LAST);

COMMENT ON COLUMN public.leads.last_sentiment IS 'Float -1.00..+1.00 — last sentiment score from background analytics';
COMMENT ON COLUMN public.leads.last_sentiment_at IS 'When last_sentiment was computed';
COMMENT ON COLUMN public.leads.last_sentiment_label IS 'Deprecated TEXT enum (kept for forensics); prefer last_sentiment numeric';

COMMIT;
