-- Migration 058: Secure Media Storage and RLS Policies (SOC2 / ISO27001)
--
-- 1. Helper function to check if the authenticated user is an admin or owner of a company.
--    SECURITY DEFINER shields execution from RLS recursion, stable for performance, fixed search_path to prevent injection.
--
CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND company_id = p_company_id
      AND role IN ('owner', 'admin')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_company_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin(UUID) TO service_role;

-- ── 2. SERVICES RLS POLICIES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "services: select own company" ON public.services;
DROP POLICY IF EXISTS "services: insert own company" ON public.services;
DROP POLICY IF EXISTS "services: update own company" ON public.services;
DROP POLICY IF EXISTS "services: delete own company" ON public.services;

CREATE POLICY "services: select own company" ON public.services
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "services: insert own company" ON public.services
  FOR INSERT WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "services: update own company" ON public.services
  FOR UPDATE USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "services: delete own company" ON public.services
  FOR DELETE USING (public.is_company_admin(company_id));

-- ── 3. AI LOGS RLS POLICIES ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_logs: select own company" ON public.ai_logs;

CREATE POLICY "ai_logs: select own company" ON public.ai_logs
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));

-- ── 4. REMINDERS RLS POLICIES ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "reminders: select own company" ON public.reminders;
DROP POLICY IF EXISTS "reminders: insert own company" ON public.reminders;
DROP POLICY IF EXISTS "reminders: update own company" ON public.reminders;
DROP POLICY IF EXISTS "reminders: delete own company" ON public.reminders;

CREATE POLICY "reminders: select own company" ON public.reminders
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "reminders: insert own company" ON public.reminders
  FOR INSERT WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "reminders: update own company" ON public.reminders
  FOR UPDATE USING (company_id IN (SELECT public.get_my_company_ids())) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "reminders: delete own company" ON public.reminders
  FOR DELETE USING (company_id IN (SELECT public.get_my_company_ids()));

-- ── 5. WEBHOOK SUBSCRIPTIONS RLS POLICIES ─────────────────────────────────────
DROP POLICY IF EXISTS "webhooks: company isolation" ON public.webhook_subscriptions;

CREATE POLICY "webhooks: company isolation" ON public.webhook_subscriptions
  FOR ALL USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

-- ── 6. STRIPE PAYMENT EVENTS RLS POLICIES ─────────────────────────────────────
DROP POLICY IF EXISTS "stripe_events: company isolation" ON public.stripe_payment_events;

CREATE POLICY "stripe_events: company isolation" ON public.stripe_payment_events
  FOR ALL USING (company_id IN (SELECT public.get_my_company_ids())) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

-- ── 7. INVITATIONS RLS POLICIES ───────────────────────────────────────────────
DROP POLICY IF EXISTS "invitations: select own company" ON public.invitations;
DROP POLICY IF EXISTS "invitations: select by email" ON public.invitations;
DROP POLICY IF EXISTS "invitations: insert own company" ON public.invitations;
DROP POLICY IF EXISTS "invitations: update own company" ON public.invitations;
DROP POLICY IF EXISTS "invitations: delete own company" ON public.invitations;

CREATE POLICY "invitations: select own company" ON public.invitations
  FOR SELECT USING (public.is_company_admin(company_id) OR invited_email = COALESCE(auth.jwt() ->> 'email', ''));

CREATE POLICY "invitations: insert own company" ON public.invitations
  FOR INSERT WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "invitations: update own company" ON public.invitations
  FOR UPDATE USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "invitations: delete own company" ON public.invitations
  FOR DELETE USING (public.is_company_admin(company_id));

-- ── 8. PLAN CHANNEL CONFIG RLS POLICIES ───────────────────────────────────────
DROP POLICY IF EXISTS "plan_channel_config: select own company" ON public.plan_channel_config;
DROP POLICY IF EXISTS "plan_channel_config: modify own company" ON public.plan_channel_config;

CREATE POLICY "plan_channel_config: select own company" ON public.plan_channel_config
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "plan_channel_config: modify own company" ON public.plan_channel_config
  FOR ALL USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

-- ── 9. CHANNELS RLS POLICIES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "channels: select own company" ON public.channels;
DROP POLICY IF EXISTS "channels: insert own company" ON public.channels;
DROP POLICY IF EXISTS "channels: update own company" ON public.channels;
DROP POLICY IF EXISTS "channels: delete own company" ON public.channels;

CREATE POLICY "channels: select own company" ON public.channels
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "channels: insert own company" ON public.channels
  FOR INSERT WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "channels: update own company" ON public.channels
  FOR UPDATE USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "channels: delete own company" ON public.channels
  FOR DELETE USING (public.is_company_admin(company_id));

-- ── 10. STORAGE BUCKET SECURITY ────────────────────────────────────────────────
-- Ensure the inbox-media bucket exists and is strict-private (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-media',
  'inbox-media',
  false,
  16777216, -- 16MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'video/3gpp', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/amr']
)
ON CONFLICT (id) DO UPDATE SET public = false;
