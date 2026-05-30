-- Migration 061: Restore channel_set_access_token (schema drift).
--
-- Production had channel_get_access_token but NOT channel_set_access_token (both declared in
-- migration 034). Without the setter, connecting a new channel or completing Instagram OAuth
-- fails to persist the encrypted access token into the Vault (settings/actions.ts,
-- instagram-auth.ts call `.rpc('channel_set_access_token')`). Re-create it (idempotent).

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
  SELECT access_token_secret_id INTO v_old_secret FROM public.channels WHERE id = p_channel_id;

  v_new_secret := vault.create_secret(p_token, 'channel_' || p_channel_id::text);

  UPDATE public.channels SET access_token_secret_id = v_new_secret, access_token = NULL WHERE id = p_channel_id;

  IF v_old_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_secret;
  END IF;

  RETURN v_new_secret;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.channel_set_access_token(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_set_access_token(UUID, TEXT) TO service_role;
