-- ============================================================
-- Agendra — Schema v4: AI Agêntica
-- Adds: persona_config + Google Calendar OAuth fields
-- Execute AFTER schema_v3_channels.sql in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. EXTEND companies TABLE
-- ============================================================

-- Configuração da persona da IA por empresa (injetada no system prompt)
alter table public.companies
  add column if not exists persona_config jsonb default '{}'::jsonb;

-- Google Calendar OAuth (refresh token permanente)
-- ⚠️  Em produção: usar Supabase Vault para criptografar este campo.
alter table public.companies
  add column if not exists google_refresh_token text;

-- Email do Google Calendar conectado (para exibir na UI)
alter table public.companies
  add column if not exists google_calendar_email text;

-- ID do calendário padrão para agendamentos (default: 'primary')
alter table public.companies
  add column if not exists google_calendar_id text default 'primary';

-- ============================================================
-- 2. EXAMPLE persona_config STRUCTURE
-- ============================================================
-- O campo persona_config aceita o seguinte JSON:
--
-- {
--   "name":          "Sofia",
--   "business_name": "Studio Bella",
--   "business_type": "salão de beleza",
--   "services":      ["corte", "coloração", "hidratação"],
--   "tone":          "amigável e sofisticado",
--   "greeting":      "Olá! Sou a Sofia, assistente virtual do Studio Bella.",
--   "timezone":      "America/Sao_Paulo",
--   "working_hours": {
--     "mon": ["09:00", "18:00"],
--     "tue": ["09:00", "18:00"],
--     "wed": ["09:00", "18:00"],
--     "thu": ["09:00", "20:00"],
--     "fri": ["09:00", "18:00"],
--     "sat": ["09:00", "14:00"]
--   },
--   "slot_duration_minutes": 60
-- }

-- ============================================================
-- 3. INDEX
-- ============================================================

create index if not exists companies_google_calendar_id_idx
  on public.companies(google_calendar_id)
  where google_calendar_id is not null;

-- ============================================================
-- 4. SEED: Atualizar persona_config para empresa existente (dev)
-- ============================================================
-- Descomente e ajuste para testar localmente:
--
-- update public.companies
-- set persona_config = '{
--   "name": "Agendra",
--   "business_name": "Agendra Demo",
--   "business_type": "consultoria",
--   "services": ["consultoria de vendas", "automação de leads"],
--   "tone": "profissional e objetivo",
--   "timezone": "America/Sao_Paulo",
--   "slot_duration_minutes": 60
-- }'::jsonb
-- where id = '<SEU_COMPANY_ID>';

-- ============================================================
-- END OF SCHEMA v4
-- ============================================================
