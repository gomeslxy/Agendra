ALTER TABLE public.ai_logs
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_chain_used TEXT[],
  ADD COLUMN IF NOT EXISTS chain_kind TEXT;

ALTER TABLE public.ai_logs ADD CONSTRAINT ai_logs_provider_check
  CHECK (provider IS NULL OR provider IN ('cerebras', 'groq', 'sambanova', 'gemini'));
ALTER TABLE public.ai_logs ADD CONSTRAINT ai_logs_chain_kind_check
  CHECK (chain_kind IS NULL OR chain_kind IN ('conv', 'tools', 'bg'));

CREATE INDEX IF NOT EXISTS idx_ai_logs_provider
  ON public.ai_logs (company_id, provider, created_at DESC);
