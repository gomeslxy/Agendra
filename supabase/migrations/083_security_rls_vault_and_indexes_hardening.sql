-- ============================================================================
-- 083_security_rls_vault_and_indexes_hardening.sql
-- Consolidated P0/P1 Security Hardening:
--   1. RLS on admin_login_attempts
--   2. Lockdown SECURITY DEFINER functions (channel_set_access_token, handle_new_membership_notification_settings)
--   3. Vault RPCs for Google Calendar refresh token (company_set_gcal_token / company_get_gcal_token)
--   4. Atomic OTP verification with SHA-256 hash + max attempts counter
--   5. Prevent ghost company creation in handle_new_user() for invited users
--   6. Harden RLS policies on 019 (is_company_admin + InitPlan) and 079 (InitPlan + membership check)
--   7. Storage RLS for private bucket inbox-media
--   8. Composite performance indexes on messages, leads, events, ai_logs
-- ============================================================================

-- 1. RLS obrigatório em admin_login_attempts (corrige P0-SEC-01)
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_login_attempts: deny all" ON public.admin_login_attempts;
CREATE POLICY "admin_login_attempts: deny all"
  ON public.admin_login_attempts FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2. Lockdown de SECURITY DEFINER pós-062 (corrige P0-SEC-02 e trigger 079)
REVOKE ALL ON FUNCTION public.channel_set_access_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.channel_set_access_token(UUID, TEXT) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.handle_new_membership_notification_settings()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_membership_notification_settings() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- 3. Vault para Google Calendar refresh token (corrige P0-SEC-03)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS google_refresh_token_secret_id UUID;

CREATE OR REPLACE FUNCTION public.company_set_gcal_token(
  p_company_id UUID,
  p_refresh_token TEXT
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
  SELECT google_refresh_token_secret_id
    INTO v_old_secret
    FROM public.companies
   WHERE id = p_company_id;

  IF p_refresh_token IS NULL OR btrim(p_refresh_token) = '' THEN
    UPDATE public.companies
       SET google_refresh_token_secret_id = NULL,
           google_refresh_token = NULL
     WHERE id = p_company_id;

    IF v_old_secret IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE id = v_old_secret;
    END IF;

    RETURN NULL;
  END IF;

  v_new_secret := vault.create_secret(p_refresh_token, 'gcal_' || p_company_id::text);

  UPDATE public.companies
     SET google_refresh_token_secret_id = v_new_secret,
         google_refresh_token = NULL
   WHERE id = p_company_id;

  IF v_old_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_secret;
  END IF;

  RETURN v_new_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.company_set_gcal_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_set_gcal_token(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.company_get_gcal_token(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret UUID;
  v_token TEXT;
BEGIN
  SELECT google_refresh_token_secret_id, google_refresh_token
    INTO v_secret, v_token
    FROM public.companies
   WHERE id = p_company_id;

  IF v_secret IS NULL THEN
    RETURN v_token;
  END IF;

  SELECT decrypted_secret
    INTO v_token
    FROM vault.decrypted_secrets
   WHERE id = v_secret;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.company_get_gcal_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_get_gcal_token(UUID) TO service_role;

-- 4. OTP com hash + contagem atômica de tentativas (corrige P0-SEC-04)
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

ALTER TABLE public.otp_codes
  ALTER COLUMN code DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.verify_otp_atomic(
  p_email TEXT,
  p_purpose TEXT,
  p_code_hash TEXT,
  p_max_attempts INT DEFAULT 5
)
RETURNS TABLE (valid BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.otp_codes%ROWTYPE;
BEGIN
  SELECT *
    INTO v_row
    FROM public.otp_codes
   WHERE email = p_email
     AND purpose = p_purpose
     AND used = false
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    UPDATE public.otp_codes SET used = true WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'expired'::text;
    RETURN;
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    UPDATE public.otp_codes SET used = true WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'max_attempts'::text;
    RETURN;
  END IF;

  IF COALESCE(v_row.code_hash, '') <> p_code_hash THEN
    UPDATE public.otp_codes
       SET attempts = attempts + 1,
           used = (attempts + 1 >= p_max_attempts)
     WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'mismatch'::text;
    RETURN;
  END IF;

  UPDATE public.otp_codes SET used = true WHERE id = v_row.id;
  RETURN QUERY SELECT true, 'ok'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_otp_atomic(TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp_atomic(TEXT, TEXT, TEXT, INT) TO service_role;

-- 5. Evita empresa fantasma para usuários convidados via inviteUserByEmail (corrige P0-SEC-05)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id   UUID;
  v_company_name TEXT;
  v_full_name    TEXT;
  v_invited_id   TEXT;
BEGIN
  v_full_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  v_invited_id := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'invited_company_id'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'company_id'), '')
  );

  IF v_invited_id IS NOT NULL THEN
    INSERT INTO public.users (id, email, full_name, company_id)
    VALUES (new.id, new.email, v_full_name, NULL)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
  END IF;

  v_company_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'company_name'), ''),
    split_part(new.email, '@', 2)
  );

  INSERT INTO public.companies (name, plan_type, subscription_status)
  VALUES (v_company_name, 'trial', 'trial')
  RETURNING id INTO v_company_id;

  INSERT INTO public.users (id, email, full_name, company_id)
  VALUES (new.id, new.email, v_full_name, v_company_id);

  INSERT INTO public.memberships (user_id, company_id, role)
  VALUES (new.id, v_company_id, 'owner');

  RETURN new;
END;
$$;

-- 6. Hardening RLS em 019 (is_company_admin + InitPlan) e 079 (InitPlan + membership check)
DROP POLICY IF EXISTS "prompt_versions: select own company" ON public.prompt_versions;
DROP POLICY IF EXISTS "prompt_versions: insert own company" ON public.prompt_versions;
DROP POLICY IF EXISTS "prompt_versions: update own company" ON public.prompt_versions;
DROP POLICY IF EXISTS "prompt_versions: admin write" ON public.prompt_versions;

CREATE POLICY "prompt_versions: select own company" ON public.prompt_versions FOR SELECT
  USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "prompt_versions: admin write" ON public.prompt_versions FOR ALL
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "prompt_experiments: select own company" ON public.prompt_experiments;
DROP POLICY IF EXISTS "prompt_experiments: insert own company" ON public.prompt_experiments;
DROP POLICY IF EXISTS "prompt_experiments: update own company" ON public.prompt_experiments;
DROP POLICY IF EXISTS "prompt_experiments: admin write" ON public.prompt_experiments;

CREATE POLICY "prompt_experiments: select own company" ON public.prompt_experiments FOR SELECT
  USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "prompt_experiments: admin write" ON public.prompt_experiments FOR ALL
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "company_knowledge: select own company" ON public.company_knowledge;
DROP POLICY IF EXISTS "company_knowledge: insert own company" ON public.company_knowledge;
DROP POLICY IF EXISTS "company_knowledge: update own company" ON public.company_knowledge;
DROP POLICY IF EXISTS "company_knowledge: delete own company" ON public.company_knowledge;
DROP POLICY IF EXISTS "company_knowledge: admin write" ON public.company_knowledge;

CREATE POLICY "company_knowledge: select own company" ON public.company_knowledge FOR SELECT
  USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "company_knowledge: admin write" ON public.company_knowledge FOR ALL
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

DO $$
BEGIN
  IF to_regclass('public.user_notification_settings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "user_notification_settings: select own" ON public.user_notification_settings';
    EXECUTE 'DROP POLICY IF EXISTS "user_notification_settings: update own" ON public.user_notification_settings';
    EXECUTE 'DROP POLICY IF EXISTS "user_notification_settings: insert own" ON public.user_notification_settings';
    EXECUTE 'DROP POLICY IF EXISTS "user_notification_settings: write own" ON public.user_notification_settings';

    EXECUTE $p$
      CREATE POLICY "user_notification_settings: select own" ON public.user_notification_settings FOR SELECT
        USING (
          user_id = (SELECT auth.uid())
          AND company_id IN (SELECT public.get_my_company_ids())
        )
    $p$;

    EXECUTE $p$
      CREATE POLICY "user_notification_settings: write own" ON public.user_notification_settings FOR ALL
        USING (
          user_id = (SELECT auth.uid())
          AND company_id IN (SELECT public.get_my_company_ids())
        )
        WITH CHECK (
          user_id = (SELECT auth.uid())
          AND company_id IN (SELECT public.get_my_company_ids())
        )
    $p$;
  END IF;
END $$;

-- 7. Storage RLS para bucket privado inbox-media (permite assinar URLs em lote via createClient)
DROP POLICY IF EXISTS "inbox_media: select own company" ON storage.objects;
CREATE POLICY "inbox_media: select own company" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'inbox-media'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.get_my_company_ids() AS id)
  );

DROP POLICY IF EXISTS "inbox_media: insert own company" ON storage.objects;
CREATE POLICY "inbox_media: insert own company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inbox-media'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.get_my_company_ids() AS id)
  );

-- 8. Índices compostos de alta frequência (corrige P2-SEC-02)
CREATE INDEX IF NOT EXISTS messages_company_lead_created_idx
  ON public.messages (company_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_company_last_msg_idx
  ON public.leads (company_id, last_message_at DESC NULLS LAST, updated_at DESC);
CREATE INDEX IF NOT EXISTS events_company_active_window_idx
  ON public.events (company_id, start_time, end_time)
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ai_logs_company_created_idx
  ON public.ai_logs (company_id, created_at DESC);
