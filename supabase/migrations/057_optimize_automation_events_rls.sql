-- Migration 057: optimize automation_events RLS
-- The original "company_isolation" policy (migration 027) ran a correlated
-- subquery against `memberships` on every row check. That re-enters RLS and is
-- evaluated per-row, hurting query latency on the settings/automation feeds.
--
-- Recreate it using get_my_company_ids() (SECURITY DEFINER) — the same pattern
-- used by prompt_versions, prompt_experiments, ai_decision_logs, etc. The helper
-- bypasses RLS recursion and lets Postgres hash the result once per statement.

DROP POLICY IF EXISTS "company_isolation" ON public.automation_events;

CREATE POLICY "company_isolation" ON public.automation_events
  FOR ALL
  USING (company_id IN (SELECT get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));
