-- Migration 027: automation_events
-- Feed de observabilidade para automações executadas pelo sistema.
-- Cada cron (lembretes, follow-up) insere aqui ao executar uma ação.
-- RLS: isolamento total por company_id.

CREATE TABLE IF NOT EXISTS automation_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id     UUID        REFERENCES leads(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL, -- 'reminder_sent' | 'followup_sent' | 'lead_escalated' | 'reactivation_sent'
  detail      TEXT,                 -- Mensagem resumida para exibição no feed
  payload     JSONB,                -- Dados extras (event_id, lead_phone, etc.)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_events_company_created
  ON automation_events (company_id, created_at DESC);

ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON automation_events;

CREATE POLICY "company_isolation" ON automation_events
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM memberships WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- TTL: deletar eventos com mais de 90 dias
DO $$ BEGIN
  PERFORM cron.unschedule('automation-events-ttl');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'automation-events-ttl',
  '0 4 * * *',
  $$DELETE FROM automation_events WHERE created_at < NOW() - INTERVAL '90 days'$$
);
