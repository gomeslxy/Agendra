-- 079_notifications_evolution.sql
-- Evolution of Notifications System: Delivery status, User Preferences, Quiet Hours

-- 1. Update public.notifications table
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'sending', 'delivered', 'failed')),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS click_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_log TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Index for idempotency checks
CREATE INDEX IF NOT EXISTS notifications_idempotency_key_idx
  ON public.notifications(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index for delivery status monitoring
CREATE INDEX IF NOT EXISTS notifications_delivery_status_idx
  ON public.notifications(delivery_status, created_at DESC);

-- 2. Update public.companies for Outbound Reminders Quiet Hours
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reminders_quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminders_quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS reminders_quiet_hours_end TEXT NOT NULL DEFAULT '08:00';

-- 3. Create user_notification_settings table
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_enabled        BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled       BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled     BOOLEAN NOT NULL DEFAULT true,
  enabled_types        TEXT[] NOT NULL DEFAULT '{"invite", "member_joined", "member_left", "channel_error", "payment_failed", "lead_hot", "system"}'::text[],
  quiet_hours_enabled  BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start    TEXT NOT NULL DEFAULT '22:00',
  quiet_hours_end      TEXT NOT NULL DEFAULT '08:00',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS user_notification_settings_updated_at ON public.user_notification_settings;
CREATE TRIGGER user_notification_settings_updated_at
  BEFORE UPDATE ON public.user_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "user_notification_settings: select own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings: select own" ON public.user_notification_settings
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_notification_settings: update own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings: update own" ON public.user_notification_settings
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_notification_settings: insert own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings: insert own" ON public.user_notification_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Permissions
GRANT SELECT, INSERT, UPDATE ON public.user_notification_settings TO authenticated;
GRANT ALL ON public.user_notification_settings TO service_role;

-- 4. Pre-populate preferences for all current memberships
INSERT INTO public.user_notification_settings (user_id, company_id)
SELECT user_id, company_id FROM public.memberships
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 5. Helper function to create default settings on new memberships (automation trigger)
CREATE OR REPLACE FUNCTION public.handle_new_membership_notification_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_notification_settings (user_id, company_id)
  VALUES (new.user_id, new.company_id)
  ON CONFLICT (user_id, company_id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_membership_created_notification_settings ON public.memberships;
CREATE TRIGGER on_membership_created_notification_settings
  AFTER INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_membership_notification_settings();
