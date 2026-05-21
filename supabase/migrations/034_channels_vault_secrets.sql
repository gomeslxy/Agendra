-- 034_channels_vault_secrets.sql
-- Move channels.access_token de plaintext para Supabase Vault

CREATE EXTENSION IF NOT EXISTS supabase_vault;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS access_token_secret_id UUID;

COMMENT ON COLUMN public.channels.access_token_secret_id IS 'UUID da secret no vault.secrets contendo o access_token criptografado';

-- Função helper para gravar token (chamada pela API com SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.channel_set_access_token(
  p_channel_id UUID,
  p_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_old_secret UUID;
  v_new_secret UUID;
BEGIN
  -- Buscar secret antiga (se houver) para deletar depois
  SELECT access_token_secret_id INTO v_old_secret FROM public.channels WHERE id = p_channel_id;

  -- Criar nova secret
  v_new_secret := vault.create_secret(p_token, 'channel_' || p_channel_id::text);

  -- Atualizar referência no channel
  UPDATE public.channels SET access_token_secret_id = v_new_secret, access_token = NULL WHERE id = p_channel_id;

  -- Cleanup secret antiga
  IF v_old_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_secret;
  END IF;

  RETURN v_new_secret;
END;
$$;

-- Função helper para ler token
CREATE OR REPLACE FUNCTION public.channel_get_access_token(p_channel_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_token TEXT;
BEGIN
  SELECT access_token_secret_id INTO v_secret_id FROM public.channels WHERE id = p_channel_id;
  IF v_secret_id IS NULL THEN
    -- Fallback: token ainda em plaintext (migração progressiva)
    SELECT access_token INTO v_token FROM public.channels WHERE id = p_channel_id;
    RETURN v_token;
  END IF;

  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.channel_set_access_token FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.channel_get_access_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_set_access_token TO service_role;
GRANT EXECUTE ON FUNCTION public.channel_get_access_token TO service_role;
