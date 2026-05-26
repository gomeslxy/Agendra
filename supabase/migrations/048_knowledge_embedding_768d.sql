-- Migration 048: Migrate company_knowledge embeddings from VECTOR(1536) to VECTOR(768)
-- Background: text-embedding-005 natively produces 768D vectors. The original column was
-- VECTOR(1536), causing all embeddings to be padded with zeros — corrupting cosine
-- similarity scores and making RAG results meaningless.
--
-- Strategy:
--   1. Add new column embedding_768 VECTOR(768)
--   2. Drop old HNSW index (incompatible dimension)
--   3. Create new HNSW index on embedding_768
--   4. Update match_knowledge() to use new column
--   5. Truncate existing rows (embeddings are invalid 1536D padded vectors; re-embed via app)
--   6. Rename columns: embedding → embedding_1536_deprecated, embedding_768 → embedding
--
-- Existing knowledge rows will be re-embedded automatically by the app on next RAG query
-- or via the admin re-embed route /api/admin/reembed-knowledge.

-- Step 1: Add new 768D column
ALTER TABLE public.company_knowledge
  ADD COLUMN IF NOT EXISTS embedding_768 VECTOR(768);

-- Step 2: Drop old HNSW index (dimension mismatch would make it useless anyway)
DROP INDEX IF EXISTS company_knowledge_hnsw_idx;

-- Step 3: Create HNSW index on new column
CREATE INDEX IF NOT EXISTS company_knowledge_hnsw_768_idx
  ON public.company_knowledge
  USING hnsw (embedding_768 vector_cosine_ops);

-- Step 5: Clear corrupt 1536D embeddings (zeros-padded, invalid for cosine similarity)
-- Knowledge content is preserved; only the corrupt embedding vectors are cleared.
-- The app re-embeds rows where embedding IS NULL on next RAG context build.
UPDATE public.company_knowledge SET embedding = NULL WHERE embedding IS NOT NULL;

-- Step 6: Rename old column to mark as deprecated (keep for rollback safety 30 days)
DO $$
BEGIN
  -- Se a coluna embedding_1536_deprecated já existir, removemos ela para evitar conflitos
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'company_knowledge' 
      AND column_name = 'embedding_1536_deprecated'
  ) THEN
    ALTER TABLE public.company_knowledge DROP COLUMN embedding_1536_deprecated;
  END IF;

  -- Se a coluna embedding_768 existir, fazemos o rename
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'company_knowledge' 
      AND column_name = 'embedding_768'
  ) THEN
    ALTER TABLE public.company_knowledge RENAME COLUMN embedding TO embedding_1536_deprecated;
    ALTER TABLE public.company_knowledge RENAME COLUMN embedding_768 TO embedding;
  END IF;
END;
$$;

-- Update HNSW index name to match new column name
DROP INDEX IF EXISTS company_knowledge_hnsw_768_idx;
CREATE INDEX IF NOT EXISTS company_knowledge_hnsw_idx
  ON public.company_knowledge
  USING hnsw (embedding vector_cosine_ops);

-- Step 4: Update match_knowledge to query embedding (now VECTOR(768))
CREATE OR REPLACE FUNCTION public.match_knowledge(
  p_company_id UUID,
  p_embedding VECTOR(768),
  p_match_threshold FLOAT,
  p_match_count INT
) RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.content,
    1 - (k.embedding <=> p_embedding) AS similarity
  FROM public.company_knowledge k
  WHERE k.company_id = p_company_id
    AND k.embedding IS NOT NULL
    AND 1 - (k.embedding <=> p_embedding) > p_match_threshold
  ORDER BY k.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_knowledge(UUID, VECTOR, FLOAT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_knowledge(UUID, VECTOR, FLOAT, INT) TO service_role;
