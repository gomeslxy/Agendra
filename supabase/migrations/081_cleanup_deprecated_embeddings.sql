-- Migration 081: Cleanup deprecated embedding_1536_deprecated column in company_knowledge
-- Item B-07 do Backlog: Remove a coluna legada de 1536D após o período de retenção e estabilização do 768D (text-embedding-005).

ALTER TABLE public.company_knowledge
  DROP COLUMN IF EXISTS embedding_1536_deprecated;
