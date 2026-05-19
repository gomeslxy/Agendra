-- Agendra Migration: 023_add_metadata_to_messages
-- Objetivo: Adicionar coluna 'metadata' JSONB na tabela 'messages' para dar suporte ao Modo Shadow e outras extensões de metadados de mensagem.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Atualizar o cache de esquemas do PostgREST
NOTIFY pgrst, 'reload schema';
