-- 053_administrative_audit_logs.sql
-- Creates the administrative audit logs system for professional SaaS compliance.
-- Logs all actions taken by administrators, owners, and system integrations.

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Performance & Tenancy Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON public.audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action);

-- 3. Security Definer helper to get admin/owner company IDs (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.get_my_admin_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id
  FROM public.memberships
  WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_admin_company_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_admin_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_admin_company_ids() TO service_role;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Only company owners/admins can select audit logs for their company
DROP POLICY IF EXISTS "audit_logs: select owner_admin" ON public.audit_logs;
CREATE POLICY "audit_logs: select owner_admin"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.get_my_admin_company_ids()));

-- Authenticated users (in server actions) can insert audit logs if they belong to the company
DROP POLICY IF EXISTS "audit_logs: insert own company" ON public.audit_logs;
CREATE POLICY "audit_logs: insert own company"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

-- UPDATE and DELETE are blocked for everyone (no policies defined, default is DENY).
-- This preserves the integrity of the audit logs.

-- 6. Grants
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
