-- 032_webhooks_integration.sql
-- Tabela de assinaturas de webhooks por empresa.
-- Permite que empresas registrem URLs externas para receber eventos em tempo real.

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  event_types  TEXT[] NOT NULL DEFAULT ARRAY['booking.created'],
  secret       TEXT NOT NULL,
  label        TEXT,                           -- Nome amigável da integração, ex: "Zapier CRM"
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fired_at TIMESTAMPTZ,
  last_error    TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_company_id ON public.webhook_subscriptions (company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_active ON public.webhook_subscriptions (company_id, is_active);

-- RLS
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks: company isolation" ON public.webhook_subscriptions
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- Comentários
COMMENT ON TABLE public.webhook_subscriptions IS 'Endpoints externos cadastrados por empresa para receber eventos via webhook (Zapier, Make, etc.)';
COMMENT ON COLUMN public.webhook_subscriptions.secret IS 'Segredo HMAC-SHA256 gerado na criação para validação de assinatura pelo receptor';
COMMENT ON COLUMN public.webhook_subscriptions.event_types IS 'Array de tipos de evento: booking.created, lead.qualified, lead.disqualified, etc.';
