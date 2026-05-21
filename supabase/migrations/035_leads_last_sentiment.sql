-- 035_leads_last_sentiment.sql
-- Persistir sentimento em lead para queries rápidas (sem precisar agregar ai_decision_logs)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_sentiment NUMERIC(3,2),  -- -1.00 a 1.00
  ADD COLUMN IF NOT EXISTS last_sentiment_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_sentiment ON public.leads (company_id, last_sentiment DESC NULLS LAST);

COMMENT ON COLUMN public.leads.last_sentiment IS 'Score de sentimento mais recente: -1 (negativo) a +1 (positivo)';
