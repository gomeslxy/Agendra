-- Migration 070: optimize auth_rls_initplan on core tables
--
-- Supabase performance advisor (lint 0003) flagged 8 RLS policies that call
-- `auth.uid()` / `auth.jwt()` directly in their predicate. Postgres re-evaluates
-- those volatile calls once PER ROW, which degrades scans at scale. Wrapping each
-- call in a scalar subquery — `(select auth.uid())` — lets the planner evaluate it
-- ONCE per statement (InitPlan) and reuse the cached value for every row.
--
-- This is a semantically identical transformation: same boolean result per row,
-- just hoisted. No change to who can read/write what. Same pattern Supabase docs
-- recommend: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ── users ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users: select own" ON public.users;
CREATE POLICY "users: select own" ON public.users
  FOR SELECT
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "users: update own" ON public.users;
CREATE POLICY "users: update own" ON public.users
  FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ── memberships ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "memberships: select own" ON public.memberships;
CREATE POLICY "memberships: select own" ON public.memberships
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- ── companies ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "companies: update owner_admin" ON public.companies;
CREATE POLICY "companies: update owner_admin" ON public.companies
  FOR UPDATE
  USING (id IN (
    SELECT memberships.company_id FROM memberships
    WHERE memberships.user_id = (select auth.uid())
      AND memberships.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ))
  WITH CHECK (id IN (
    SELECT memberships.company_id FROM memberships
    WHERE memberships.user_id = (select auth.uid())
      AND memberships.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ));

-- ── ai_traces ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view ai_traces from their companies" ON public.ai_traces;
CREATE POLICY "Users can view ai_traces from their companies" ON public.ai_traces
  FOR SELECT
  USING (company_id IN (
    SELECT memberships.company_id FROM memberships
    WHERE memberships.user_id = (select auth.uid())
  ));

-- ── invitations ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitations: select own company" ON public.invitations;
CREATE POLICY "invitations: select own company" ON public.invitations
  FOR SELECT
  USING (
    is_company_admin(company_id)
    OR (invited_email = COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))
  );

-- ── notifications ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications: select own" ON public.notifications;
CREATE POLICY "notifications: select own" ON public.notifications
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "notifications: update own" ON public.notifications;
CREATE POLICY "notifications: update own" ON public.notifications
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
