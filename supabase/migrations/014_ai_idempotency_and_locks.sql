-- Agendra Migration: 014_ai_idempotency_and_locks
-- Objetivo: Garantir que a IA processe cada mensagem exatamente uma vez e evitar condições de corrida.

-- 1. Tabela de Mensagens Processadas (Deduplicação)
CREATE TABLE IF NOT EXISTS public.processed_messages (
  provider_message_id  TEXT PRIMARY KEY,
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id              UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
  error_message        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Index para limpeza periódica ou auditoria
CREATE INDEX IF NOT EXISTS processed_messages_company_idx ON public.processed_messages(company_id);
CREATE INDEX IF NOT EXISTS processed_messages_created_at_idx ON public.processed_messages(created_at);

-- 2. Trava de Concorrência na tabela Leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_processing BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_message_id TEXT, -- ID da última mensagem processada com sucesso
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;

-- 3. Trigger para updated_at na processed_messages
DROP TRIGGER IF EXISTS processed_messages_updated_at ON public.processed_messages;
CREATE TRIGGER processed_messages_updated_at
  BEFORE UPDATE ON public.processed_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Grants
GRANT SELECT, INSERT, UPDATE ON public.processed_messages TO authenticated;
GRANT ALL ON public.processed_messages TO service_role;
