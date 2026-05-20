-- Migration 026: Fix company_knowledge embedding dimension
-- text-embedding-005 generates 768D vectors, not 1536D.
-- Padding to 1536D corrupts cosine similarity scores.
-- This migration drops the old column and recreates it at 768D.

-- Drop old index first
DROP INDEX IF EXISTS company_knowledge_embedding_idx;

-- Change column dimension
ALTER TABLE public.company_knowledge
  ALTER COLUMN embedding TYPE VECTOR(768);

-- Recreate index for 768D
CREATE INDEX company_knowledge_embedding_idx
  ON public.company_knowledge
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Update the match_knowledge function to use 768D parameter
CREATE OR REPLACE FUNCTION match_knowledge(
  p_company_id UUID,
  p_embedding VECTOR(768),
  p_match_threshold FLOAT,
  p_match_count INT
) RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.content,
    1 - (k.embedding <=> p_embedding) AS similarity
  FROM public.company_knowledge k
  WHERE k.company_id = p_company_id
    AND 1 - (k.embedding <=> p_embedding) > p_match_threshold
  ORDER BY k.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;
