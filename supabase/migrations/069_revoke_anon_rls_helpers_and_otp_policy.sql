-- Migration 069: close the residual advisor findings from the forensic audit.
--
-- (a) RLS helper SECURITY DEFINER funcs (get_my_company_ids, get_my_admin_company_ids,
--     is_company_admin) were left executable by `anon`. They only ever reveal the CALLER's own
--     memberships (auth.uid()), so anon gets nothing useful — but there is no reason for an
--     unauthenticated client to call them. Keep `authenticated` (RLS evaluation needs it),
--     revoke `anon`. Clears advisor 0028.
-- (b) public.otp_codes has RLS enabled but no policy (advisor 0008). That already denies all
--     non-service-role access (service_role bypasses RLS), which is the intent — make it
--     explicit with a deny-all policy so the posture is documented, not accidental.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_my_company_ids','get_my_admin_company_ids','is_company_admin')
  LOOP
    -- EXECUTE is granted to PUBLIC by default (anon inherits via PUBLIC), so revoking
    -- only FROM anon is a no-op. Revoke FROM PUBLIC + anon, then re-grant authenticated.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- Explicit deny-all on otp_codes (service_role bypasses RLS and is the only legitimate accessor).
DROP POLICY IF EXISTS "otp_codes: deny all" ON public.otp_codes;
CREATE POLICY "otp_codes: deny all" ON public.otp_codes
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
