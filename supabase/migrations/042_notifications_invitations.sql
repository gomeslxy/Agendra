-- 042_notifications_invitations
-- Creates notifications and invitations tables with RLS, indexes, pg_cron expiry

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('invite','member_joined','member_left','channel_error','payment_failed','lead_hot','system')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  action_url  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: select own" ON public.notifications;
CREATE POLICY "notifications: select own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications: update own" ON public.notifications;
CREATE POLICY "notifications: update own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- service_role bypasses RLS — used by server actions via admin client
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id, read, created_at DESC)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS notifications_company_idx
  ON public.notifications(company_id, created_at DESC);

-- ── invitations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_email   TEXT NOT NULL,
  invited_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate active invites for same email+company
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_unique_idx
  ON public.invitations(company_id, invited_email)
  WHERE status = 'pending';

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admin/owner of company can read all invitations for their company
DROP POLICY IF EXISTS "invitations: select own company" ON public.invitations;
CREATE POLICY "invitations: select own company" ON public.invitations
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- Invited user can also see their own invitation (for accept-invite page)
DROP POLICY IF EXISTS "invitations: select by email" ON public.invitations;
CREATE POLICY "invitations: select by email" ON public.invitations
  FOR SELECT USING (
    invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

CREATE INDEX IF NOT EXISTS invitations_company_status_idx
  ON public.invitations(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS invitations_email_status_idx
  ON public.invitations(invited_email, status);

-- ── pg_cron: expire pending invitations nightly ───────────────────────────────
SELECT cron.schedule(
  'expire-invitations',
  '0 3 * * *',
  $$
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now();
  $$
);
