-- 076_billing_hardening.sql
-- Billing hardening after full audit (2026-06-01):
-- (1) Webhook idempotency table — prevents duplicate event processing
-- (2) Add 'trialing' to subscription_status CHECK constraint (Stripe native trial)

-- ── (1) Webhook idempotency ───────────────────────────────────────────────────
-- Each incoming Stripe event is recorded here before processing.
-- Duplicate delivery (Stripe retries) hits the PK conflict → returns 200 immediately.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TTL: keep 90 days of event history for debugging, then auto-purge
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-stripe-webhook-events');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-stripe-webhook-events',
  '0 3 * * *',
  $$
    DELETE FROM public.stripe_webhook_events
    WHERE processed_at < now() - interval '90 days';
  $$
);

-- No RLS needed — accessed exclusively via service_role key in the webhook handler.
-- Enabling RLS with no policies = deny-all for authenticated users (correct).
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- ── (2) Add 'trialing' to subscription_status CHECK ──────────────────────────
-- Stripe uses 'trialing' for Stripe-managed trials. Without this, a subscription
-- update with status='trialing' silently fails the CHECK and leaves the company
-- in an inconsistent state.
DO $$
BEGIN
  -- Drop the old constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_subscription_status_check'
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT companies_subscription_status_check;
  END IF;

  -- Re-create with 'trialing' included
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN (
      'trial', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired'
    ));
END $$;
