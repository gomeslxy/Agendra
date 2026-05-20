-- Migration 029: Leads rate limit and followup lock hardening
-- Drop old company knowledge vector index (ivfflat) if exists and recreate using HNSW for 768D (text-embedding-005)
DROP INDEX IF EXISTS public.company_knowledge_embedding_idx;

CREATE INDEX IF NOT EXISTS company_knowledge_embedding_hnsw_idx
  ON public.company_knowledge
  USING hnsw (embedding vector_cosine_ops);

-- Add rate limiting and followup lock columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_in_progress BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;

-- Add index on company_id and last_message_at/followup_in_progress for fast queries
CREATE INDEX IF NOT EXISTS leads_company_followup_idx
  ON public.leads (company_id, followup_in_progress, last_followup_at);
