-- 033_stripe_proration_events.sql
-- Persistir eventos de 3DS failure e proration para análise de churn

CREATE TABLE IF NOT EXISTS public.stripe_payment_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('3ds_required', '3ds_failed', 'proration_applied', 'invoice_failed', 'invoice_paid')),
  stripe_event_id TEXT UNIQUE,
  invoice_id    TEXT,
  amount_cents  INTEGER,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_events_company ON public.stripe_payment_events (company_id, created_at DESC);
CREATE INDEX idx_stripe_events_type ON public.stripe_payment_events (event_type, created_at DESC);

ALTER TABLE public.stripe_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_events: company isolation" ON public.stripe_payment_events
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.stripe_payment_events IS 'Eventos críticos de pagamento Stripe (3DS, proration, falhas) para análise de churn e suporte';
