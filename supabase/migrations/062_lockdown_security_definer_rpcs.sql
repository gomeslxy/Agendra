-- Migration 062: Lock down SECURITY DEFINER functions exposed to anon/authenticated.
--
-- Supabase grants EXECUTE on public functions to anon + authenticated by default. Several
-- SECURITY DEFINER functions are only ever called server-side (service_role) or by pg_cron
-- (postgres), but were callable by any unauthenticated client via /rest/v1/rpc/<fn>:
--   • agendra_call_cron     → anon could trigger ANY /api/cron/* route WITH the Vault CRON_SECRET
--                             (privilege escalation / abuse of expensive AI jobs).
--   • match_knowledge       → anon could pass any p_company_id and read another tenant's RAG corpus.
--   • channel_set/get_access_token → anon could overwrite/read a channel's access token.
--   • book_appointment_atomic → anon could create appointments for any company/lead.
--   • cleanup_expired_otps, rls_auto_enable, handle_new_user → admin/trigger-only utilities.
--
-- Verified callers (grep): all use the admin (service_role) client; agendra_call_cron is invoked
-- only by pg_cron (postgres). RLS helper funcs (get_my_company_ids, get_my_admin_company_ids,
-- is_company_admin) are intentionally left executable by authenticated — RLS evaluation needs
-- them and they only ever reveal the caller's OWN memberships.
--
-- Uses oid::regprocedure so exact signatures never need to be hand-typed.

DO $$
DECLARE r RECORD;
BEGIN
  -- service_role-only (server-side app calls)
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('channel_get_access_token','channel_set_access_token','match_knowledge',
                        'book_appointment_atomic','cleanup_expired_otps')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- pg_cron-only (runs as postgres); no client/app role needs it
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'agendra_call_cron'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
  END LOOP;

  -- admin/trigger utilities — no client role needs EXECUTE (handle_new_user fires as a trigger)
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('rls_auto_enable','handle_new_user')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
