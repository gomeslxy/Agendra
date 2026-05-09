-- ============================================================
-- Agendra — Schema SQL
-- Multi-tenant SaaS: users ↔ companies ↔ memberships
-- Execute this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID helper (already available in Supabase, but safe to re-declare)
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Companies (tenants)
create table if not exists public.companies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique,
  plan        text not null default 'trial' check (plan in ('trial', 'starter', 'pro', 'enterprise')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Users (extends auth.users — one row per Supabase auth user)
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  company_id  uuid references public.companies(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Memberships (user ↔ company relationship with role)
create table if not exists public.memberships (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null default 'user' check (role in ('owner', 'admin', 'user')),
  created_at  timestamptz not null default now(),
  unique (user_id, company_id)
);

-- ============================================================
-- 2. UPDATED_AT TRIGGER HELPER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. AUTO-PROVISION ON SIGNUP (trigger on auth.users)
-- When a user signs up, automatically:
--   a) Create a company (using metadata "company_name")
--   b) Create the public.users record
--   c) Create a membership as "owner"
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer            -- runs as superuser, not as the new user
set search_path = public
as $$
declare
  v_company_id  uuid;
  v_company_name text;
  v_full_name   text;
begin
  -- Resolve company name from signup metadata, fallback to email domain
  v_company_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'company_name'), ''),
    split_part(new.email, '@', 2)
  );

  -- Resolve full name
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Create the company (tenant)
  insert into public.companies (name)
  values (v_company_name)
  returning id into v_company_id;

  -- Create the user profile
  insert into public.users (id, email, full_name, company_id)
  values (new.id, new.email, v_full_name, v_company_id);

  -- Create membership as owner
  insert into public.memberships (user_id, company_id, role)
  values (new.id, v_company_id, 'owner');

  return new;
end;
$$;

-- Attach trigger to auth.users (fires after every new signup)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.users       enable row level security;
alter table public.companies   enable row level security;
alter table public.memberships enable row level security;

-- ---- public.users policies --------------------------------

-- A user can only read their own profile
drop policy if exists "users: select own" on public.users;
create policy "users: select own"
  on public.users
  for select
  using (auth.uid() = id);

-- A user can only update their own profile
drop policy if exists "users: update own" on public.users;
create policy "users: update own"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- The trigger function (security definer) handles INSERT — no user-facing insert policy needed.

-- ---- public.companies policies ---------------------------

-- A user can only see companies they are a member of
drop policy if exists "companies: select member" on public.companies;
create policy "companies: select member"
  on public.companies
  for select
  using (
    id in (
      select company_id
      from public.memberships
      where user_id = auth.uid()
    )
  );

-- Only owners/admins can update company details
drop policy if exists "companies: update owner_admin" on public.companies;
create policy "companies: update owner_admin"
  on public.companies
  for update
  using (
    id in (
      select company_id
      from public.memberships
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

-- ---- public.memberships policies -------------------------

-- A user can see their own memberships
drop policy if exists "memberships: select own" on public.memberships;
create policy "memberships: select own"
  on public.memberships
  for select
  using (user_id = auth.uid());

-- ============================================================
-- 5. HELPFUL INDEXES
-- ============================================================

create index if not exists memberships_user_id_idx    on public.memberships(user_id);
create index if not exists memberships_company_id_idx on public.memberships(company_id);
create index if not exists users_company_id_idx       on public.users(company_id);
create index if not exists users_email_idx            on public.users(email);

-- ============================================================
-- 6. GRANT PERMISSIONS (anon + authenticated roles)
-- ============================================================

-- Supabase already grants authenticated users access to public schema.
-- These are explicit grants for safety:
grant usage on schema public to authenticated;
grant select, update on public.users       to authenticated;
grant select, update on public.companies   to authenticated;
grant select         on public.memberships to authenticated;

-- Service role (used by server-side only, never exposed to browser):
grant all on all tables in schema public to service_role;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
