-- Migration 065: Restore channel_get_access_token (schema drift).
--
-- Forensic audit (2026-05-30) found the READER counterpart of channel_set_access_token
-- missing from production (declared in migration 034, never landed). It is called in 7
-- server-side paths to read a channel's Vault-encrypted token:
--   lib/whatsapp/client.ts, lib/channels/send.ts (x2), app/api/meta/webhook,
--   app/api/webhooks/instagram, app/api/cron/morning, app/api/cron/check-channels.
--
-- Impact: any channel whose token lives in the Vault (Instagram OAuth, additional WhatsApp
-- numbers) could not be read → outbound send silently failed. The default WhatsApp number
-- survived only because it falls back to the WHATSAPP_TOKEN env var, masking the regression
-- at low traffic. Re-create it (idempotent) with the same lockdown as migration 062.

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
    -- Fallback: token still in plaintext (progressive migration)
    SELECT access_token INTO v_token FROM public.channels WHERE id = p_channel_id;
    RETURN v_token;
  END IF;

  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_token;
END;
$$;

-- Lockdown (matches migration 062): server-side only.
REVOKE EXECUTE ON FUNCTION public.channel_get_access_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.channel_get_access_token(UUID) TO service_role;
