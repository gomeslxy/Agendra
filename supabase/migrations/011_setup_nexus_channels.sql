-- ============================================================
-- Agendra — Migration 011: Setup Nexus Channels
-- Consolida a estrutura multi-tenant para canais Meta.
-- ============================================================

-- 1. Garantir que a extensão uuid-ossp exista
create extension if not exists "uuid-ossp";

-- 2. Criar ou atualizar a tabela de channels
create table if not exists public.channels (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  provider     text not null default 'whatsapp' check (provider in ('whatsapp', 'instagram', 'messenger')),
  
  -- Meta IDs: phone_number_id ou account_id
  provider_id  text not null,
  
  -- Credenciais (Futuro: usar Vault ou pg_sodium para access_token)
  access_token text,
  
  -- Metadados de Identificação
  name         text,         -- Nome amigável (ex: "WhatsApp Suporte")
  phone        text,         -- Número formatado para exibição
  
  -- Gestão de Estado
  status       text not null default 'active' check (status in ('active', 'error', 'paused')),
  config       jsonb default '{}'::jsonb, -- Campos flexíveis (verify_token, etc)
  
  -- Observabilidade
  last_error   text,
  last_seen_at timestamptz,
  
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 3. Unicidade: Impede que o mesmo canal seja cadastrado em duas contas
drop index if exists channels_provider_id_unique;
create unique index channels_provider_id_unique on public.channels(provider, provider_id);

-- 4. RLS (Row Level Security) — Blindagem de Dados
alter table public.channels enable row level security;

drop policy if exists "Membros veem canais da empresa" on public.channels;
create policy "Membros veem canais da empresa"
  on public.channels for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

drop policy if exists "Admins gerenciam canais da empresa" on public.channels;
create policy "Admins gerenciam canais da empresa"
  on public.channels for all
  using (
    company_id in (
      select m.company_id from public.memberships m 
      where m.user_id = auth.uid() 
      and m.role in ('admin', 'owner')
    )
  );

-- 5. Trigger de Updated At
drop trigger if exists set_channels_updated_at on public.channels;
create trigger set_channels_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

-- 6. Grants
grant select, insert, update, delete on public.channels to authenticated;
grant all on public.channels to service_role;
