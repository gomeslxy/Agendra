-- ============================================================
-- Agendra — Schema v2
-- Adds: leads, messages, events + strict RLS
-- Execute AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists public.leads (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  phone       text not null,
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'instagram', 'form')),
  source      text,
  status      text not null default 'cold' check (status in ('cold', 'warm', 'hot', 'success')),
  summary     text,
  heat_score  int not null default 0 check (heat_score >= 0 and heat_score <= 100),
  city        text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'note')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  title       text not null,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  gcal_event_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 2. UPDATED_AT TRIGGERS
-- ============================================================

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table public.leads    enable row level security;
alter table public.messages enable row level security;
alter table public.events   enable row level security;

-- leads: company members can select
drop policy if exists "leads: select own company" on public.leads;
create policy "leads: select own company"
  on public.leads for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- leads: company members can insert
drop policy if exists "leads: insert own company" on public.leads;
create policy "leads: insert own company"
  on public.leads for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- leads: company members can update
drop policy if exists "leads: update own company" on public.leads;
create policy "leads: update own company"
  on public.leads for update
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- messages: company members can select
drop policy if exists "messages: select own company" on public.messages;
create policy "messages: select own company"
  on public.messages for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- messages: company members can insert
drop policy if exists "messages: insert own company" on public.messages;
create policy "messages: insert own company"
  on public.messages for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- events: company members can select
drop policy if exists "events: select own company" on public.events;
create policy "events: select own company"
  on public.events for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- events: company members can insert
drop policy if exists "events: insert own company" on public.events;
create policy "events: insert own company"
  on public.events for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- events: company members can update
drop policy if exists "events: update own company" on public.events;
create policy "events: update own company"
  on public.events for update
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. INDEXES
-- ============================================================

create index if not exists leads_company_id_idx    on public.leads(company_id);
create index if not exists leads_phone_idx         on public.leads(phone);
create index if not exists leads_status_idx        on public.leads(status);
create index if not exists messages_lead_id_idx    on public.messages(lead_id);
create index if not exists messages_company_id_idx on public.messages(company_id);
create index if not exists events_lead_id_idx      on public.events(lead_id);
create index if not exists events_company_id_idx   on public.events(company_id);

-- ============================================================
-- 5. GRANTS
-- ============================================================

grant select, insert, update on public.leads    to authenticated;
grant select, insert         on public.messages to authenticated;
grant select, insert, update on public.events   to authenticated;

grant all on public.leads    to service_role;
grant all on public.messages to service_role;
grant all on public.events   to service_role;

-- ============================================================
-- END OF SCHEMA v2
-- ============================================================
