-- 007_leads_is_paused.sql

alter table public.leads add column if not exists is_paused boolean default false not null;

create index if not exists leads_is_paused_idx on public.leads(is_paused);
