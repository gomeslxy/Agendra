-- Agendra Migration: 013_ai_logs
-- Creates the ai_logs table for high-fidelity observability

CREATE TABLE IF NOT EXISTS public.ai_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id             UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  flow_type           TEXT, -- 'followup', 'confirmation', etc.
  tools_called        JSONB DEFAULT '[]',
  heat_score_before   INT,
  heat_score_after    INT,
  score_validated_to  INT,
  score_delta         INT,
  latency_ms          INT,
  model               TEXT,
  tokens_input        INT,
  tokens_output       INT,
  cost                DECIMAL(10, 6),
  retries             INT DEFAULT 0,
  error               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_logs: select own company" ON public.ai_logs;
CREATE POLICY "ai_logs: select own company"
  ON public.ai_logs FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS ai_logs_company_id_idx ON public.ai_logs(company_id);
CREATE INDEX IF NOT EXISTS ai_logs_lead_id_idx ON public.ai_logs(lead_id);
CREATE INDEX IF NOT EXISTS ai_logs_created_at_idx ON public.ai_logs(created_at);

-- Grants
GRANT SELECT ON public.ai_logs TO authenticated;
GRANT ALL ON public.ai_logs TO service_role;
