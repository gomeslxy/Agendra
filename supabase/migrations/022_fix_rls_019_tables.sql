-- Migration 022: Fix RLS on tables created in migration 019
-- Uses get_my_company_ids() (SECURITY DEFINER) instead of direct memberships subquery
-- to prevent RLS recursion — consistent with the rest of the schema (fix_rls_recursion.sql).

-- ── prompt_versions ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "prompt_versions: select own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: select own company" ON public.prompt_versions FOR SELECT
  USING (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "prompt_versions: insert own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: insert own company" ON public.prompt_versions FOR INSERT
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "prompt_versions: update own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: update own company" ON public.prompt_versions FOR UPDATE
  USING (company_id IN (SELECT get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

-- ── prompt_experiments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "prompt_experiments: select own company" ON public.prompt_experiments;
CREATE POLICY "prompt_experiments: select own company" ON public.prompt_experiments FOR SELECT
  USING (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "prompt_experiments: insert own company" ON public.prompt_experiments;
CREATE POLICY "prompt_experiments: insert own company" ON public.prompt_experiments FOR INSERT
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "prompt_experiments: update own company" ON public.prompt_experiments;
CREATE POLICY "prompt_experiments: update own company" ON public.prompt_experiments FOR UPDATE
  USING (company_id IN (SELECT get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

-- ── company_knowledge ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "company_knowledge: select own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: select own company" ON public.company_knowledge FOR SELECT
  USING (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "company_knowledge: insert own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: insert own company" ON public.company_knowledge FOR INSERT
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "company_knowledge: update own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: update own company" ON public.company_knowledge FOR UPDATE
  USING (company_id IN (SELECT get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "company_knowledge: delete own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: delete own company" ON public.company_knowledge FOR DELETE
  USING (company_id IN (SELECT get_my_company_ids()));

-- ── transactions ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "transactions: select own company" ON public.transactions;
CREATE POLICY "transactions: select own company" ON public.transactions FOR SELECT
  USING (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "transactions: insert own company" ON public.transactions;
CREATE POLICY "transactions: insert own company" ON public.transactions FOR INSERT
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "transactions: update own company" ON public.transactions;
CREATE POLICY "transactions: update own company" ON public.transactions FOR UPDATE
  USING (company_id IN (SELECT get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));

-- ── ai_decision_logs ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_decision_logs: select own company" ON public.ai_decision_logs;
CREATE POLICY "ai_decision_logs: select own company" ON public.ai_decision_logs FOR SELECT
  USING (company_id IN (SELECT get_my_company_ids()));

DROP POLICY IF EXISTS "ai_decision_logs: insert own company" ON public.ai_decision_logs;
CREATE POLICY "ai_decision_logs: insert own company" ON public.ai_decision_logs FOR INSERT
  WITH CHECK (company_id IN (SELECT get_my_company_ids()));
