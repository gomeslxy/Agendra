-- Migration 025: Enable RLS on processed_messages
-- Table was created in 014 without RLS — cross-tenant leak risk via admin client reads.
-- Access pattern: only service_role (admin client) writes/reads this table.
-- Authenticated users (company members) may read their own company's rows for audit.

ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default in Postgres, but explicit policy is safer
-- and documents intent. Uses BYPASSRLS attribute implicitly — this policy covers
-- scenarios where BYPASSRLS is revoked or the role is used with SET LOCAL ROLE.
DROP POLICY IF EXISTS "processed_messages: service_role full access" ON public.processed_messages;
CREATE POLICY "processed_messages: service_role full access" ON public.processed_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated company members may read their own company's rows only.
-- Uses get_my_company_ids() (SECURITY DEFINER) — consistent with migrations 022+.
DROP POLICY IF EXISTS "processed_messages: select own company" ON public.processed_messages;
CREATE POLICY "processed_messages: select own company" ON public.processed_messages
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT get_my_company_ids()));
