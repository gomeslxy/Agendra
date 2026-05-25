-- 043_performance_indexes.sql
-- Índices de performance identificados em auditoria DBA (2026-05-24).
-- Nota: CONCURRENTLY removido — não funciona dentro de bloco de transação
-- (migrations do Supabase rodam em transação implícita).
-- Para tabelas grandes em produção, aplique via SQL Editor direto com CONCURRENTLY.

-- ── messages ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_lead_company_created
  ON public.messages (lead_id, company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_lead_role
  ON public.messages (lead_id, role);

-- ── leads ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_company_not_paused
  ON public.leads (company_id, status, last_message_at ASC)
  WHERE is_paused = false AND followup_in_progress = false;

CREATE INDEX IF NOT EXISTS idx_leads_company_status_last_msg
  ON public.leads (company_id, status, last_message_at ASC)
  WHERE status IN ('cold', 'warm');

-- ── companies ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status
  ON public.companies (subscription_status)
  WHERE subscription_status IN ('active', 'trial', 'trialing');

-- ── events ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_company_start_time
  ON public.events (company_id, start_time);

-- ── reminders ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reminders_company_status_remind
  ON public.reminders (company_id, status, remind_at)
  WHERE status = 'pending';

-- ── automation_events ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_automation_events_lead_type
  ON public.automation_events (lead_id, type);

-- ── processed_messages ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_processed_messages_status_created
  ON public.processed_messages (status, created_at)
  WHERE status = 'processing';

-- ── memberships ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memberships_user_id
  ON public.memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_memberships_company_role
  ON public.memberships (company_id, role);
