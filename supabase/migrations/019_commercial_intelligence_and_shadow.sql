-- Agendra Migration: 019_commercial_intelligence_and_shadow
-- Objetivo: Expandir o banco de dados do Agendra para a v4, adicionando suporte para Inteligência Comercial, RAG vetorial (pgvector), Modo Shadow, Versionamento de Prompts com Testes A/B e Fintech Conversacional (transações/Pix).

-- 1. Habilitar a extensão pgvector para Busca Semântica
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Adicionar novas colunas na tabela de leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS control_mode TEXT DEFAULT 'autonomous' CHECK (control_mode IN ('autonomous', 'shadow', 'manual')),
  ADD COLUMN IF NOT EXISTS last_sentiment TEXT DEFAULT 'neutral' CHECK (last_sentiment IN ('positive', 'neutral', 'frustrated', 'aggressively_cold'));

-- 3. Criar a Tabela de Versões de Prompts (Cognitive Control)
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version             INT NOT NULL,
  ai_name             TEXT NOT NULL,
  ai_tone             TEXT NOT NULL,
  system_instructions TEXT NOT NULL,
  ai_forbidden        TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único composto para garantir integridade das versões por empresa
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_company_version_idx ON public.prompt_versions(company_id, version);

-- 4. Criar a Tabela de Experimentos A/B de Prompts
CREATE TABLE IF NOT EXISTS public.prompt_experiments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  version_a_id  UUID NOT NULL REFERENCES public.prompt_versions(id) ON DELETE CASCADE,
  version_b_id  UUID NOT NULL REFERENCES public.prompt_versions(id) ON DELETE CASCADE,
  traffic_split INT NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 0 AND 100), -- % de leads direcionados à Versão A
  metrics       JSONB DEFAULT '{"leads_a":0, "conversions_a":0, "leads_b":0, "conversions_b":0}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  ended_at      TIMESTAMPTZ
);

-- 5. Criar a Tabela de Base de Conhecimento Semântica (RAG)
CREATE TABLE IF NOT EXISTS public.company_knowledge (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_name   TEXT NOT NULL, -- Ex: "tabela-precos.pdf" ou "faq-site"
  content       TEXT NOT NULL, -- Bloco de texto limpo (chunk)
  embedding     VECTOR(1536),  -- Vetor para embeddings semânticos
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Criar a Tabela de Transações de Fintech Conversacional (Pix Dinâmico / Stripe)
CREATE TABLE IF NOT EXISTS public.transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  amount         DECIMAL(10, 2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'refunded')),
  pix_qrcode     TEXT,
  pix_image_url  TEXT,
  provider_tx_id TEXT, -- ID de transação do provedor de pagamento (Stripe/MercadoPago)
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  paid_at        TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Criar a Tabela de Auditoria Cognitiva e Explainability da IA (ai_decision_logs)
CREATE TABLE IF NOT EXISTS public.ai_decision_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id           UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  intent_detected   TEXT,
  sentiment_score   FLOAT, -- Escala de -1.0 (frustrado) a 1.0 (muito feliz)
  urgency_detected  BOOLEAN DEFAULT FALSE,
  objection_handled TEXT,
  rationale         TEXT, -- Raciocínio detalhado ou log cognitivo do Gemini
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Row Level Security (RLS) - Garantir Multi-tenancy absoluto
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decision_logs ENABLE ROW LEVEL SECURITY;

-- 8.1 Políticas para public.prompt_versions
DROP POLICY IF EXISTS "prompt_versions: select own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: select own company" ON public.prompt_versions FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "prompt_versions: insert own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: insert own company" ON public.prompt_versions FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "prompt_versions: update own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: update own company" ON public.prompt_versions FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 8.2 Políticas para public.prompt_experiments
DROP POLICY IF EXISTS "prompt_experiments: select own company" ON public.prompt_experiments;
CREATE POLICY "prompt_experiments: select own company" ON public.prompt_experiments FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "prompt_experiments: insert own company" ON public.prompt_experiments;
CREATE POLICY "prompt_experiments: insert own company" ON public.prompt_experiments FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "prompt_experiments: update own company" ON public.prompt_experiments;
CREATE POLICY "prompt_experiments: update own company" ON public.prompt_experiments FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 8.3 Políticas para public.company_knowledge
DROP POLICY IF EXISTS "company_knowledge: select own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: select own company" ON public.company_knowledge FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "company_knowledge: insert own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: insert own company" ON public.company_knowledge FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "company_knowledge: update own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: update own company" ON public.company_knowledge FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "company_knowledge: delete own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: delete own company" ON public.company_knowledge FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 8.4 Políticas para public.transactions
DROP POLICY IF EXISTS "transactions: select own company" ON public.transactions;
CREATE POLICY "transactions: select own company" ON public.transactions FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "transactions: insert own company" ON public.transactions;
CREATE POLICY "transactions: insert own company" ON public.transactions FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "transactions: update own company" ON public.transactions;
CREATE POLICY "transactions: update own company" ON public.transactions FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 8.5 Políticas para public.ai_decision_logs
DROP POLICY IF EXISTS "ai_decision_logs: select own company" ON public.ai_decision_logs;
CREATE POLICY "ai_decision_logs: select own company" ON public.ai_decision_logs FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "ai_decision_logs: insert own company" ON public.ai_decision_logs;
CREATE POLICY "ai_decision_logs: insert own company" ON public.ai_decision_logs FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 9. Triggers para atualização atômica de updated_at
DROP TRIGGER IF EXISTS transactions_updated_at ON public.transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. Índices de Alta Performance
CREATE INDEX IF NOT EXISTS leads_company_control_mode_idx ON public.leads(company_id, control_mode);
CREATE INDEX IF NOT EXISTS prompt_versions_company_idx ON public.prompt_versions(company_id);
CREATE INDEX IF NOT EXISTS prompt_experiments_company_status_idx ON public.prompt_experiments(company_id, status);
CREATE INDEX IF NOT EXISTS company_knowledge_company_idx ON public.company_knowledge(company_id);
CREATE INDEX IF NOT EXISTS transactions_company_lead_idx ON public.transactions(company_id, lead_id);
CREATE INDEX IF NOT EXISTS ai_decision_logs_company_lead_idx ON public.ai_decision_logs(company_id, lead_id);

-- Índice vetorial aproximado de busca semântica em HNSW (mais performático e confiável no PostgreSQL)
-- Utiliza cosine_ops para calcular similaridade de cosseno
CREATE INDEX IF NOT EXISTS company_knowledge_hnsw_idx 
  ON public.company_knowledge USING hnsw (embedding vector_cosine_ops);

-- 11. Função RPC para RAG Semântico ( match_knowledge )
CREATE OR REPLACE FUNCTION public.match_knowledge(
  p_company_id UUID,
  p_embedding VECTOR(1536),
  p_match_threshold FLOAT,
  p_match_count INT
) RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- 12. Concessão de Privilégios (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_versions TO authenticated;
GRANT ALL ON public.prompt_versions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_experiments TO authenticated;
GRANT ALL ON public.prompt_experiments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_knowledge TO authenticated;
GRANT ALL ON public.company_knowledge TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

GRANT SELECT, INSERT ON public.ai_decision_logs TO authenticated;
GRANT ALL ON public.ai_decision_logs TO service_role;
