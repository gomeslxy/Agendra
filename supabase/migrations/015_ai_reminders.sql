-- Agendra Migration: 015_ai_reminders
-- Objetivo: Suporte a lembretes automáticos de agendamento via WhatsApp.

-- 1. Tabela de Lembretes
CREATE TABLE IF NOT EXISTS public.reminders (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  remind_at    TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  content      TEXT, -- Mensagem personalizada, se houver
  error_log    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index para o cron job buscar lembretes pendentes rapidamente
CREATE INDEX IF NOT EXISTS reminders_status_remind_at_idx ON public.reminders(status, remind_at);
CREATE INDEX IF NOT EXISTS reminders_event_id_idx ON public.reminders(event_id);

-- 2. Trigger para updated_at
DROP TRIGGER IF EXISTS reminders_updated_at ON public.reminders;
CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders: select own company" ON public.reminders;
CREATE POLICY "reminders: select own company"
  ON public.reminders FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- 4. Grants
GRANT SELECT, INSERT, UPDATE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;
