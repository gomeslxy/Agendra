-- Migration 068: Restore channels.access_token_secret_id + migrate plaintext tokens to Vault.
--
-- Forensic audit (2026-05-30) found the column declared in migration 034 ABSENT from production.
-- Effect: channel_get/set_access_token reference it, so the Vault encryption-at-rest mechanism
-- was dead and channel tokens stayed PLAINTEXT in channels.access_token (a security regression —
-- 034's whole purpose). The get RPC silently returned NULL (PostgREST error swallowed) and code
-- fell back to the plaintext column, masking the breakage.
--
-- This migration: (1) restores the column, (2) encrypts any existing plaintext token into the
-- Vault and nulls the plaintext, verified to round-trip before clearing.

-- 1. Restore the column (additive, idempotent).
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS access_token_secret_id UUID;
COMMENT ON COLUMN public.channels.access_token_secret_id IS 'UUID of the vault.secrets row holding the encrypted access_token';

-- 2. Migrate plaintext → Vault for any channel still holding a plaintext token.
DO $$
DECLARE r RECORD; v_secret UUID;
BEGIN
  FOR r IN SELECT id, access_token FROM public.channels
           WHERE access_token_secret_id IS NULL AND access_token IS NOT NULL AND length(access_token) > 0
  LOOP
    v_secret := vault.create_secret(r.access_token, 'channel_' || r.id::text);
    -- Only null the plaintext once the Vault value round-trips correctly.
    IF (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_secret) = r.access_token THEN
      UPDATE public.channels SET access_token_secret_id = v_secret, access_token = NULL WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
