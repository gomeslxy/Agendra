ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_sentiment NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS last_sentiment_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_sentiment ON public.leads (company_id, last_sentiment DESC NULLS LAST);
