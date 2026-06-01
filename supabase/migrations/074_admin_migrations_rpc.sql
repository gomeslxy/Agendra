-- 074_admin_migrations_rpc.sql
-- Audit H2 fix: the admin Debug "Migrations" card queried public.schema_migrations,
-- which DOES NOT EXIST. The Supabase CLI records applied migrations in
-- supabase_migrations.schema_migrations (columns: version text 'YYYYMMDDHHMMSS', name).
-- supabase-js cannot conveniently read a non-public schema, so expose a locked-down
-- SECURITY DEFINER RPC and call it from the server with the service-role key.
-- EXECUTE is REVOKED from anon/authenticated (consistent with migration 073).

CREATE OR REPLACE FUNCTION public.admin_recent_migrations()
RETURNS TABLE(name text, executed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, supabase_migrations AS $$
  SELECT
    coalesce(name, version)                    AS name,
    to_timestamp(version, 'YYYYMMDDHH24MISS')  AS executed_at
  FROM supabase_migrations.schema_migrations
  WHERE version ~ '^\d{14}$'   -- only timestamp-form versions are parseable
  ORDER BY version DESC
  LIMIT 30;
$$;

-- Lock down: server-only via service role.
REVOKE ALL ON FUNCTION public.admin_recent_migrations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_migrations() TO service_role;
