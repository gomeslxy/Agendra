-- ============================================================
-- Agendra — Schema v3: Channels (Multi-tenant)
-- Quebra o single-tenant: mapeia phone_number_id → company_id
-- Execute AFTER schema_v2.sql in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLE: channels
-- ============================================================

create table if not exists public.channels (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  provider     text not null check (provider in ('whatsapp', 'instagram')),
  -- Meta phone_number_id (ex: "106540352422966") ou account_id
  provider_id  text not null,
  -- Access token criptografado (Token de Sistema do Meta ou token de página do Instagram)
  -- Armazenado como texto. Para produção, use Vault ou pgcrypto para criptografar.
  access_token text,
  status       text not null default 'active' check (status in ('active', 'error', 'paused')),
  -- Metadados extras (ex: display_phone_number, waba_id, etc.)
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Restrição de unicidade: um provider_id só pode pertencer a uma empresa
create unique index if not exists channels_provider_provider_id_unique
  on public.channels(provider, provider_id);

-- ============================================================
-- 2. UPDATED_AT TRIGGER
-- ============================================================

create trigger channels_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table public.channels enable row level security;

-- Membros da empresa podem ver seus próprios canais
drop policy if exists "channels: select own company" on public.channels;
create policy "channels: select own company"
  on public.channels for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- Apenas admins da empresa podem inserir canais
drop policy if exists "channels: insert own company" on public.channels;
create policy "channels: insert own company"
  on public.channels for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- Apenas admins da empresa podem atualizar canais
drop policy if exists "channels: update own company" on public.channels;
create policy "channels: update own company"
  on public.channels for update
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

-- ============================================================
-- 4. INDEXES
-- ============================================================

create index if not exists channels_company_id_idx  on public.channels(company_id);
create index if not exists channels_provider_id_idx on public.channels(provider_id);
create index if not exists channels_status_idx      on public.channels(status);

-- ============================================================
-- 5. GRANTS
-- ============================================================

grant select, insert, update on public.channels to authenticated;
grant all                     on public.channels to service_role;

-- ============================================================
-- 6. ATIVAR REALTIME nas tabelas críticas
-- ============================================================
-- Execute estes comandos para ativar Realtime nas tabelas:
--
-- No Supabase Dashboard > Database > Replication > Tables:
-- Marcar: messages, leads, channels
--
-- Ou via SQL (requer super-user / service_role):
--   alter publication supabase_realtime add table public.messages;
--   alter publication supabase_realtime add table public.leads;
--   alter publication supabase_realtime add table public.channels;
--
-- Executar abaixo se tiver permissão:
-- alter publication supabase_realtime add table public.messages;
-- alter publication supabase_realtime add table public.leads;

-- ============================================================
-- 7. DADO DE SEED PARA DESENVOLVIMENTO (opcional)
-- ============================================================
-- Descomente e ajuste para testar localmente:
--
-- insert into public.channels (company_id, provider, provider_id, access_token, status, meta)
-- values (
--   '<SEU_COMPANY_ID>',
--   'whatsapp',
--   '<SEU_WHATSAPP_PHONE_NUMBER_ID>',
--   '<SEU_ACCESS_TOKEN>',
--   'active',
--   '{"display_phone_number": "+55 11 99999-9999", "waba_id": "<WABA_ID>"}'
-- );

-- ============================================================
-- END OF SCHEMA v3
-- ============================================================
