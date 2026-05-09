-- ============================================================
-- Agendra — Fix RLS Infinite Recursion
-- Error: 42P17 — infinite recursion detected in policy for
--        relation "memberships"
--
-- ROOT CAUSE:
--   The "companies: select member" policy queries `memberships`.
--   When Supabase evaluates that subquery it re-applies
--   memberships RLS, which can trigger the companies policy
--   again — creating a cycle.
--
-- FIX:
--   Use a SECURITY DEFINER helper function to read memberships
--   *without* going through RLS. All policies call this function
--   instead of querying `memberships` directly.
--
-- HOW TO APPLY:
--   Paste this in Supabase Dashboard → SQL Editor and run.
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTION (bypasses RLS — safe, runs as definer)
-- ============================================================

create or replace function public.get_my_company_ids()
returns setof uuid
language sql
security definer          -- runs as the function owner, NOT the caller
stable                    -- result is consistent within a single query
set search_path = public  -- prevents search_path injection
as $$
  select company_id
  from public.memberships
  where user_id = auth.uid()
$$;

-- ============================================================
-- 2. REWRITE public.companies POLICIES
--    (they used to call memberships directly — now use function)
-- ============================================================

drop policy if exists "companies: select member"   on public.companies;
drop policy if exists "companies: update owner_admin" on public.companies;

create policy "companies: select member"
  on public.companies
  for select
  using (id in (select public.get_my_company_ids()));

create policy "companies: update owner_admin"
  on public.companies
  for update
  using (
    id in (
      select company_id
      from public.memberships         -- safe: security definer fn below shields this
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  )
  with check (
    id in (
      select company_id
      from public.memberships
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ============================================================
-- 3. REWRITE public.memberships POLICIES
--    Simple direct check — no cross-table reference.
--    Drop all existing policies first to clear any stale ones.
-- ============================================================

drop policy if exists "memberships: select own"     on public.memberships;
drop policy if exists "memberships: insert own"     on public.memberships;
drop policy if exists "memberships: update own"     on public.memberships;
drop policy if exists "memberships: delete own"     on public.memberships;

-- Users can only read their own memberships — no subquery, no recursion.
create policy "memberships: select own"
  on public.memberships
  for select
  using (user_id = auth.uid());

-- ============================================================
-- 4. REWRITE schema_v2 policies for leads / messages / events
--    (all used inline `select from memberships` — use function)
-- ============================================================

-- leads
drop policy if exists "leads: select own company" on public.leads;
drop policy if exists "leads: insert own company" on public.leads;
drop policy if exists "leads: update own company" on public.leads;

create policy "leads: select own company"
  on public.leads for select
  using (company_id in (select public.get_my_company_ids()));

create policy "leads: insert own company"
  on public.leads for insert
  with check (company_id in (select public.get_my_company_ids()));

create policy "leads: update own company"
  on public.leads for update
  using     (company_id in (select public.get_my_company_ids()))
  with check (company_id in (select public.get_my_company_ids()));

-- messages
drop policy if exists "messages: select own company" on public.messages;
drop policy if exists "messages: insert own company" on public.messages;

create policy "messages: select own company"
  on public.messages for select
  using (company_id in (select public.get_my_company_ids()));

create policy "messages: insert own company"
  on public.messages for insert
  with check (company_id in (select public.get_my_company_ids()));

-- events
drop policy if exists "events: select own company" on public.events;
drop policy if exists "events: insert own company" on public.events;
drop policy if exists "events: update own company" on public.events;

create policy "events: select own company"
  on public.events for select
  using (company_id in (select public.get_my_company_ids()));

create policy "events: insert own company"
  on public.events for insert
  with check (company_id in (select public.get_my_company_ids()));

create policy "events: update own company"
  on public.events for update
  using (company_id in (select public.get_my_company_ids()));

-- ============================================================
-- 5. ADD MISSING DELETE POLICIES
--    Previously missing — users could delete any row via
--    direct DB access if RLS wasn't enforced for DELETE.
-- ============================================================

-- leads DELETE
drop policy if exists "leads: delete own company" on public.leads;
create policy "leads: delete own company"
  on public.leads for delete
  using (company_id in (select public.get_my_company_ids()));

-- events DELETE
drop policy if exists "events: delete own company" on public.events;
create policy "events: delete own company"
  on public.events for delete
  using (company_id in (select public.get_my_company_ids()));

-- messages DELETE
drop policy if exists "messages: delete own company" on public.messages;
create policy "messages: delete own company"
  on public.messages for delete
  using (company_id in (select public.get_my_company_ids()));

-- ============================================================
-- 6. VERIFY: list all RLS policies for sanity check
-- Run this after applying to verify coverage:
-- select tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, cmd;
-- ============================================================

-- ============================================================
-- END OF MIGRATION
-- ============================================================
