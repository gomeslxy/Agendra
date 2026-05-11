-- 006_ai_traces.sql

create table public.ai_traces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete set null,
  trace_type text not null, -- 'tool_call', 'completion', 'error', 'system'
  request_data jsonb,
  response_data jsonb,
  duration_ms integer,
  tokens_used integer,
  created_at timestamp with time zone default now() not null
);

-- RLS policies
alter table public.ai_traces enable row level security;

create policy "Users can view ai_traces from their companies"
  on public.ai_traces for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- Indexes for performance
create index ai_traces_company_id_idx on public.ai_traces(company_id);
create index ai_traces_lead_id_idx on public.ai_traces(lead_id);
create index ai_traces_created_at_idx on public.ai_traces(created_at);
