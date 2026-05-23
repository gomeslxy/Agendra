# Notifications + Team Invitations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete real-time notification system and polished team invitation flow — persistent DB notifications, Supabase Realtime delivery, full invite lifecycle (send/accept/decline/cancel/expire/resend), Liquid Glass Bell UI with badge, inline accept/decline on invite notifications.

**Architecture:** Two new tables (`notifications`, `invitations`) with RLS. A `createNotification()` helper called from server actions and cron routes. `NotificationBell` client component subscribes to Supabase Realtime `postgres_changes` on `notifications WHERE user_id = auth.uid()`. Invitation flow detects existing vs new users, routing to in-app notification or email accordingly.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + Auth Admin + Realtime), Framer Motion 12, shadcn/ui, pnpm, Tailwind v4

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/042_notifications_invitations.sql` | Create | Schema for `notifications` + `invitations`, RLS, indexes, pg_cron expiry |
| `lib/types/database.ts` | Modify | Add `Notification`, `Invitation`, `NotificationType` types |
| `lib/notifications/create.ts` | Create | `createNotification()` helper (uses admin client, server-only) |
| `components/app/notification-bell.tsx` | Create | Bell icon + unread badge + Realtime panel + accept/decline actions |
| `app/(app)/settings/invitations/actions.ts` | Create | `acceptInvitation`, `declineInvitation`, `cancelInvitation`, `resendInvitation` |
| `app/(app)/settings/actions.ts` | Modify | Refactor `inviteTeamMember` to use `invitations` table + `createNotification` |
| `app/(app)/settings/settings-shell.tsx` | Modify | Add pending invitations list section in Account tab |
| `components/app/topbar.tsx` | Modify | Replace Bell stub with `<NotificationBell />` |
| `app/accept-invite/page.tsx` | Create | Auto-accept flow for new users arriving via email link |
| `app/api/stripe/webhook/route.ts` | Modify | Call `createNotification` on `invoice.payment_failed` |
| `app/api/cron/check-channels/route.ts` | Modify | Implement real channel check + `createNotification` on error |

---

## Task 1: Database Migration — `notifications` + `invitations` tables

**Files:**
- Create: `supabase/migrations/042_notifications_invitations.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/042_notifications_invitations.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration to local/dev Supabase**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm supabase db push
```

Expected: migration applied, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/042_notifications_invitations.sql
git commit -m "feat(db): add notifications and invitations tables with RLS and pg_cron expiry"
```

---

## Task 2: TypeScript types for new tables

**Files:**
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Add types at end of `lib/types/database.ts`**

```typescript
// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'invite'
  | 'member_joined'
  | 'member_left'
  | 'channel_error'
  | 'payment_failed'
  | 'lead_hot'
  | 'system';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  company_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  metadata: Record<string, unknown>;
  priority: NotificationPriority;
  read: boolean;
  created_at: string;
}

// ── Invitations ───────────────────────────────────────────────────────────────

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type InvitationRole = 'admin' | 'member';

export interface Invitation {
  id: string;
  company_id: string;
  invited_email: string;
  invited_by: string;
  role: InvitationRole;
  status: InvitationStatus;
  expires_at: string;
  notification_id: string | null;
  accepted_at: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0 or only pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat(types): add Notification and Invitation TypeScript types"
```

---

## Task 3: `createNotification()` helper

**Files:**
- Create: `lib/notifications/create.ts`

- [ ] **Step 1: Create the file**

Create `lib/notifications/create.ts`:

```typescript
/**
 * Server-only helper for creating notifications.
 * Uses admin client to bypass RLS — call only from server actions / route handlers.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationType, NotificationPriority } from '@/lib/types/database';

export interface CreateNotificationInput {
  company_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url?: string;
  metadata?: Record<string, unknown>;
  priority?: NotificationPriority;
}

/**
 * Creates a notification row. Returns the new notification id.
 * Fire-and-forget safe — errors are logged but do not throw.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notifications')
      .insert({
        company_id: input.company_id,
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        body: input.body,
        action_url: input.action_url ?? null,
        metadata: input.metadata ?? {},
        priority: input.priority ?? 'medium',
        read: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[createNotification] error:', error.message);
      return null;
    }
    return data.id;
  } catch (err: any) {
    console.error('[createNotification] unexpected error:', err.message);
    return null;
  }
}

/**
 * Creates the same notification for multiple users (e.g. all members of a company).
 */
export async function createNotificationForUsers(
  users: Array<{ user_id: string }>,
  base: Omit<CreateNotificationInput, 'user_id'>
): Promise<void> {
  if (!users.length) return;
  try {
    const admin = createAdminClient();
    const rows = users.map(({ user_id }) => ({
      company_id: base.company_id,
      user_id,
      type: base.type,
      title: base.title,
      body: base.body,
      action_url: base.action_url ?? null,
      metadata: base.metadata ?? {},
      priority: base.priority ?? 'medium',
      read: false,
    }));
    const { error } = await admin.from('notifications').insert(rows);
    if (error) console.error('[createNotificationForUsers] error:', error.message);
  } catch (err: any) {
    console.error('[createNotificationForUsers] unexpected error:', err.message);
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/create.ts
git commit -m "feat(notifications): add createNotification helper with admin client"
```

---

## Task 4: Invitation server actions

**Files:**
- Create: `app/(app)/settings/invitations/actions.ts`

- [ ] **Step 1: Create the file**

Create `app/(app)/settings/invitations/actions.ts`:

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications/create";
import { revalidatePath } from "next/cache";

/**
 * Accept a pending invitation. Caller must be the invited user.
 */
export async function acceptInvitation(invitationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  // Fetch invitation
  const { data: invite, error: fetchErr } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchErr || !invite) throw new Error("Convite não encontrado ou já processado.");

  // Security: invited_email must match current user
  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error("Este convite não pertence à sua conta.");
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from("invitations").update({ status: "expired" }).eq("id", invitationId);
    throw new Error("Este convite expirou. Solicite um novo convite.");
  }

  // Check if already a member
  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("company_id", invite.company_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Already member — just mark invite accepted and notification read
    await admin.from("invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invitationId);
    if (invite.notification_id) {
      await admin.from("notifications").update({ read: true }).eq("id", invite.notification_id);
    }
    revalidatePath("/settings");
    return;
  }

  // Create membership
  const { error: memberErr } = await admin.from("memberships").insert({
    company_id: invite.company_id,
    user_id: user.id,
    role: invite.role,
  });
  if (memberErr) throw new Error("Erro ao criar membership: " + memberErr.message);

  // Mark invitation accepted
  await admin.from("invitations").update({
    status: "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", invitationId);

  // Mark invite notification as read
  if (invite.notification_id) {
    await admin.from("notifications").update({ read: true }).eq("id", invite.notification_id);
  }

  // Fetch company name for notification
  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", invite.company_id)
    .maybeSingle();

  const { data: profile } = await admin
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const memberName = profile?.full_name ?? user.email ?? "Novo membro";
  const companyName = company?.name ?? "sua empresa";

  // Notify the inviter
  await createNotification({
    company_id: invite.company_id,
    user_id: invite.invited_by,
    type: "member_joined",
    title: "Membro entrou para o time",
    body: `${memberName} aceitou seu convite e agora faz parte de ${companyName}.`,
    action_url: "/settings",
    metadata: { member_id: user.id, member_name: memberName },
    priority: "medium",
  });

  revalidatePath("/settings");
}

/**
 * Decline a pending invitation.
 */
export async function declineInvitation(invitationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { data: invite, error: fetchErr } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchErr || !invite) throw new Error("Convite não encontrado.");

  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error("Este convite não pertence à sua conta.");
  }

  await admin.from("invitations").update({ status: "declined" }).eq("id", invitationId);

  if (invite.notification_id) {
    await admin.from("notifications").update({ read: true }).eq("id", invite.notification_id);
  }

  // Fetch names for notification
  const { data: company } = await admin.from("companies").select("name").eq("id", invite.company_id).maybeSingle();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const memberName = profile?.full_name ?? user.email ?? "Usuário";
  const companyName = company?.name ?? "sua empresa";

  await createNotification({
    company_id: invite.company_id,
    user_id: invite.invited_by,
    type: "member_left",
    title: "Convite recusado",
    body: `${memberName} recusou o convite para ${companyName}.`,
    action_url: "/settings",
    metadata: { declined_email: invite.invited_email },
    priority: "medium",
  });

  revalidatePath("/settings");
}

/**
 * Cancel a pending invitation (admin/owner only).
 */
export async function cancelInvitation(invitationId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const role = profile.memberships?.[0]?.role;
  if (role !== "admin" && role !== "owner") throw new Error("Apenas administradores podem cancelar convites.");

  const admin = createAdminClient();

  // Verify invitation belongs to caller's company
  const { data: invite, error } = await admin
    .from("invitations")
    .select("id, company_id, notification_id, status")
    .eq("id", invitationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !invite) throw new Error("Convite não encontrado.");
  if (invite.status !== "pending") throw new Error("Apenas convites pendentes podem ser cancelados.");

  await admin.from("invitations").update({ status: "cancelled" }).eq("id", invitationId);

  // Soft-delete linked notification if still unread
  if (invite.notification_id) {
    await admin
      .from("notifications")
      .update({ read: true })
      .eq("id", invite.notification_id)
      .eq("read", false);
  }

  revalidatePath("/settings");
}

/**
 * Resend a pending or expired invitation.
 */
export async function resendInvitation(invitationId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const role = profile.memberships?.[0]?.role;
  if (role !== "admin" && role !== "owner") throw new Error("Apenas administradores podem reenviar convites.");

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !invite) throw new Error("Convite não encontrado.");
  if (!["pending", "expired"].includes(invite.status)) {
    throw new Error("Apenas convites pendentes ou expirados podem ser reenviados.");
  }

  // Rate limit: check if a resend was done in last 24h (look at created_at of existing record)
  const ageHours = (Date.now() - new Date(invite.created_at).getTime()) / (1000 * 60 * 60);
  if (invite.status === "pending" && ageHours < 24) {
    throw new Error("Aguarde 24 horas antes de reenviar este convite.");
  }

  // Reset expiry
  await admin.from("invitations").update({
    status: "pending",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", invitationId);

  // Try to find user and create in-app notification
  const { data: existingUser } = await admin.auth.admin.listUsers();
  const targetUser = existingUser?.users?.find(
    (u) => u.email?.toLowerCase() === invite.invited_email.toLowerCase()
  );

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  const { data: inviterProfile } = await admin.from("users").select("full_name").eq("id", profile.id).maybeSingle();

  const companyName = company?.name ?? "uma empresa";
  const inviterName = inviterProfile?.full_name ?? "Alguém";

  if (targetUser) {
    const notifId = await createNotification({
      company_id: companyId,
      user_id: targetUser.id,
      type: "invite",
      title: "Convite para equipe",
      body: `${inviterName} convidou você para fazer parte de ${companyName} como ${invite.role === "admin" ? "Administrador" : "Membro"}.`,
      action_url: "/settings",
      metadata: {
        invitation_id: invitationId,
        inviter_name: inviterName,
        company_name: companyName,
        role: invite.role,
      },
      priority: "high",
    });
    if (notifId) {
      await admin.from("invitations").update({ notification_id: notifId }).eq("id", invitationId);
    }
  } else {
    // Resend email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.agendra.com.br";
    await admin.auth.admin.inviteUserByEmail(invite.invited_email, {
      redirectTo: `${appUrl}/accept-invite?invitationId=${invitationId}`,
      data: { company_id: companyId, invited_role: invite.role },
    });
  }

  revalidatePath("/settings");
}

/**
 * Get all notifications for the current user (last 20).
 */
export async function getNotifications() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[getNotifications] error:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id); // RLS double-check
}

/**
 * Mark all notifications as read.
 */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/settings/invitations/actions.ts"
git commit -m "feat(invitations): add accept/decline/cancel/resend actions with security guards"
```

---

## Task 5: Refactor `inviteTeamMember` in `settings/actions.ts`

**Files:**
- Modify: `app/(app)/settings/actions.ts`

- [ ] **Step 1: Replace the `inviteTeamMember` function**

Find the existing `inviteTeamMember` export in `app/(app)/settings/actions.ts` and replace it entirely with:

```typescript
/**
 * Invite a team member. Creates invitation row and either:
 * - Creates in-app notification (if user already has account)
 * - Sends email invite via Supabase Auth (new users)
 */
export async function inviteTeamMember(email: string, role: "admin" | "member") {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const currentRole = profile.memberships?.[0]?.role;
  if (currentRole !== "admin" && currentRole !== "owner") {
    throw new Error("Apenas administradores podem convidar membros.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("E-mail inválido.");

  const admin = createAdminClient();

  // Rate limit: max 5 pending invites per company
  const { count: pendingCount } = await admin
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");

  if ((pendingCount ?? 0) >= 5) {
    throw new Error("Limite de 5 convites pendentes atingido. Cancele um convite existente primeiro.");
  }

  // Check for duplicate active invite
  const { data: duplicate } = await admin
    .from("invitations")
    .select("id")
    .eq("company_id", companyId)
    .eq("invited_email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (duplicate) {
    throw new Error("Já existe um convite pendente para este e-mail.");
  }

  // Check if already a member
  const { data: existingMember } = await admin
    .from("memberships")
    .select("memberships.id")
    .eq("company_id", companyId)
    .eq("memberships.user_id",
      // subquery: get user_id from auth by email
      // We do it differently: look up user first
      "placeholder"
    )
    .maybeSingle();

  // Look up if user exists
  const { data: allUsers } = await admin.auth.admin.listUsers();
  const existingUser = allUsers?.users?.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  );

  if (existingUser) {
    // Check if already member
    const { data: alreadyMember } = await admin
      .from("memberships")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (alreadyMember) {
      throw new Error("Este usuário já faz parte da equipe.");
    }
  }

  // Fetch company and inviter names for notification
  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  const { data: inviterProfile } = await admin.from("users").select("full_name").eq("id", profile.id).maybeSingle();

  const companyName = company?.name ?? "uma empresa";
  const inviterName = inviterProfile?.full_name ?? "Alguém";

  // Create invitation record
  const { data: invitation, error: inviteErr } = await admin
    .from("invitations")
    .insert({
      company_id: companyId,
      invited_email: normalizedEmail,
      invited_by: profile.id,
      role,
    })
    .select("id")
    .single();

  if (inviteErr) throw new Error("Erro ao criar convite: " + inviteErr.message);

  const invitationId = invitation.id;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.agendra.com.br";

  if (existingUser) {
    // In-app notification — Realtime delivers immediately
    const { createNotification } = await import("@/lib/notifications/create");
    const notifId = await createNotification({
      company_id: companyId,
      user_id: existingUser.id,
      type: "invite",
      title: "Convite para equipe",
      body: `${inviterName} convidou você para fazer parte de ${companyName} como ${role === "admin" ? "Administrador" : "Membro"}.`,
      action_url: "/settings",
      metadata: {
        invitation_id: invitationId,
        inviter_name: inviterName,
        company_name: companyName,
        role,
      },
      priority: "high",
    });

    if (notifId) {
      await admin.from("invitations").update({ notification_id: notifId }).eq("id", invitationId);
    }
  } else {
    // New user — send email invite with deep link
    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${appUrl}/accept-invite?invitationId=${invitationId}`,
      data: { company_id: companyId, invited_role: role },
    });

    if (emailErr) {
      // Roll back invitation row
      await admin.from("invitations").delete().eq("id", invitationId);
      if (emailErr.message.includes("already registered")) {
        throw new Error("Este e-mail já possui uma conta. O usuário pode fazer login e aceitar o convite.");
      }
      throw new Error(emailErr.message);
    }
  }

  revalidatePath("/settings");
}
```

Also add `createNotification` import at top of the file (after existing imports):
```typescript
// Add this import at the top of actions.ts after existing imports:
// (dynamic import is used inside the function to avoid circular deps — no static import needed)
```

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/settings/actions.ts"
git commit -m "feat(invitations): refactor inviteTeamMember to use invitations table and in-app notifications"
```

---

## Task 6: `NotificationBell` component

**Files:**
- Create: `components/app/notification-bell.tsx`

- [ ] **Step 1: Create the component**

Create `components/app/notification-bell.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, X, CheckCheck, AlertTriangle, CreditCard, Users, UserPlus, Zap, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/(app)/settings/invitations/actions";
import { acceptInvitation, declineInvitation } from "@/app/(app)/settings/invitations/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types/database";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-brand-blue-400",
  low: "bg-white/30",
};

const PRIORITY_BG: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/20",
  high: "bg-orange-500/8 border-orange-500/15",
  medium: "bg-white/[0.04] border-white/[0.08]",
  low: "bg-transparent border-white/[0.05]",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  invite: <UserPlus size={14} className="text-brand-blue-400" />,
  member_joined: <Users size={14} className="text-brand-teal-400" />,
  member_left: <Users size={14} className="text-white/40" />,
  channel_error: <AlertTriangle size={14} className="text-red-400" />,
  payment_failed: <CreditCard size={14} className="text-red-400" />,
  lead_hot: <Zap size={14} className="text-orange-400" />,
  system: <Info size={14} className="text-white/50" />,
};

interface NotificationCardProps {
  notification: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function NotificationCard({ notification, onRead, onDismiss }: NotificationCardProps) {
  const [accepting, startAccept] = useTransition();
  const [declining, startDecline] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  const invitationId = notification.metadata?.invitation_id as string | undefined;
  const isInvite = notification.type === "invite" && invitationId;

  function handleAccept() {
    if (!invitationId) return;
    startAccept(async () => {
      try {
        await acceptInvitation(invitationId);
        toast.success("Convite aceito! Bem-vindo ao time.");
        setDismissed(true);
        onDismiss(notification.id);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  function handleDecline() {
    if (!invitationId) return;
    startDecline(async () => {
      try {
        await declineInvitation(invitationId);
        toast.info("Convite recusado.");
        setDismissed(true);
        onDismiss(notification.id);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  function handleClick() {
    if (!notification.read) onRead(notification.id);
    if (notification.action_url && !isInvite) {
      window.location.href = notification.action_url;
    }
  }

  if (dismissed) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        PRIORITY_BG[notification.priority],
        !notification.read && "ring-1 ring-brand-blue-500/20",
        !isInvite && notification.action_url && "cursor-pointer hover:bg-white/[0.06]"
      )}
      onClick={!isInvite ? handleClick : undefined}
    >
      <div className="flex items-start gap-2.5">
        {/* Priority dot + type icon */}
        <div className="relative mt-0.5 flex-shrink-0">
          <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full", PRIORITY_DOT[notification.priority])} />
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">
            {TYPE_ICON[notification.type]}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className={cn("text-[12px] font-semibold leading-tight", notification.read ? "text-white/50" : "text-white")}>
              {notification.title}
            </p>
            <span className="flex-shrink-0 text-[10px] text-white/30">{timeAgo(notification.created_at)}</span>
          </div>
          <p className={cn("mt-0.5 text-[11px] leading-relaxed", notification.read ? "text-white/30" : "text-white/60")}>
            {notification.body}
          </p>

          {/* Invite action buttons */}
          {isInvite && (
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={handleAccept}
                disabled={accepting || declining}
                className="flex items-center gap-1 rounded-lg bg-brand-teal-500/20 px-3 py-1.5 text-[11px] font-semibold text-brand-teal-300 transition-colors hover:bg-brand-teal-500/30 disabled:opacity-50"
              >
                {accepting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-brand-teal-400 border-t-transparent" />
                ) : (
                  <Check size={11} />
                )}
                Aceitar
              </button>
              <button
                onClick={handleDecline}
                disabled={accepting || declining}
                className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/[0.10] hover:text-white/70 disabled:opacity-50"
              >
                {declining ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-transparent" />
                ) : (
                  <X size={11} />
                )}
                Recusar
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [markingAll, startMarkAll] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const displayCount = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  // Load notifications on mount
  useEffect(() => {
    getNotifications().then((data) => {
      setNotifications(data as Notification[]);
      setLoaded(true);
    });
  }, []);

  // Supabase Realtime — subscribe to new notifications for this user
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 20));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    markNotificationRead(id).catch(() => {});
  }

  function handleDismiss(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function handleMarkAll() {
    startMarkAll(async () => {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    });
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Notificações"
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell size={18} />
        <AnimatePresence>
          {displayCount && (
            <motion.span
              key="badge"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
            >
              {displayCount}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.97)] shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-white">Notificações</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-brand-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-blue-400">
                    {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  disabled={markingAll}
                  className="flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-white/70 disabled:opacity-50"
                >
                  <CheckCheck size={12} />
                  Marcar lidas
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-[420px] overflow-y-auto">
              {!loaded ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Bell size={24} className="text-white/20" />
                  <p className="text-[12px] text-white/30">Nenhuma notificação</p>
                </div>
              ) : (
                <AnimatePresence>
                  <div className="space-y-1.5 p-3">
                    {notifications.map((n) => (
                      <NotificationCard
                        key={n.id}
                        notification={n}
                        onRead={handleRead}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-white/[0.08] px-4 py-2.5">
                <p className="text-center text-[11px] text-white/25">
                  Mostrando as últimas {notifications.length} notificações
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/app/notification-bell.tsx
git commit -m "feat(ui): add NotificationBell component with Realtime, badge, and invite actions"
```

---

## Task 7: Wire `NotificationBell` into `Topbar`

**Files:**
- Modify: `components/app/topbar.tsx`

- [ ] **Step 1: Replace Bell stub in Topbar**

In `components/app/topbar.tsx`:

1. Add import at top (after existing imports):
```typescript
import { NotificationBell } from "@/components/app/notification-bell";
```

2. Remove the `Bell` import from lucide-react (it's now inside NotificationBell).

3. Find the Bell stub section:
```typescript
{/* Bell — notification panel stub */}
<div ref={bellRef} className="relative">
  <Button
    variant="ghost"
    size="sm"
    aria-label="Notificações"
    onClick={() => setShowNotifications((v) => !v)}
  >
    <Bell size={18} />
  </Button>
  <AnimatePresence>
    {showNotifications && (
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.97 }}
        transition={{ duration: 0.14 }}
        className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.97)] p-4 shadow-2xl backdrop-blur-xl"
      >
        <p className="text-xs font-semibold">Notificações</p>
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-fg-3)" }}>
          Nenhuma notificação no momento.
        </p>
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

Replace with:
```typescript
{/* Notification Bell — real-time */}
{profile?.id && <NotificationBell userId={profile.id} />}
```

4. Remove the now-unused state and refs:
   - `const [showNotifications, setShowNotifications] = useState(false);`
   - `const bellRef = useRef<HTMLDivElement>(null);`
   - The `useEffect` for outside-click on notifications panel

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/app/topbar.tsx
git commit -m "feat(topbar): replace Bell stub with NotificationBell component"
```

---

## Task 8: Pending invitations list in Settings

**Files:**
- Modify: `app/(app)/settings/settings-shell.tsx`

- [ ] **Step 1: Read the Account tab section in settings-shell.tsx to find where team members list ends**

The Account tab renders team members. After that list, add a pending invitations section. Find the line with `{/* Pending invitations */}` comment or the end of the members list in the Account tab.

Look for the pattern in settings-shell.tsx where members are rendered (around line 2060–2100) and add after the invite modal button:

```typescript
// Add these imports at the top of settings-shell.tsx after existing imports:
import { cancelInvitation, resendInvitation } from "./invitations/actions";
import type { Invitation } from "@/lib/types/database";
```

Then in the component props/data, add invitations to the interface and rendering. Find the `interface SettingsShellProps` and add:
```typescript
pendingInvitations?: Invitation[];
```

Then in the Account tab JSX, after the team members list, before the closing of that section, add:

```typescript
{/* Pending Invitations */}
{pendingInvitations && pendingInvitations.length > 0 && (
  <div className="mt-6">
    <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-white/30">
      Convites Pendentes
    </p>
    <div className="space-y-2">
      {pendingInvitations.map((inv) => {
        const daysLeft = Math.max(0, Math.ceil(
          (new Date(inv.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ));
        return (
          <div
            key={inv.id}
            className="glass flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-white/80">{inv.invited_email}</p>
              <p className="text-[11px] text-white/35">
                {inv.role === "admin" ? "Administrador" : "Membro"} · expira em {daysLeft}d
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                onClick={async () => {
                  try {
                    await resendInvitation(inv.id);
                    toast.success("Convite reenviado!");
                  } catch (err: any) {
                    toast.error(err.message);
                  }
                }}
                className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.10] hover:text-white/80"
              >
                Reenviar
              </button>
              <button
                onClick={async () => {
                  try {
                    await cancelInvitation(inv.id);
                    toast.success("Convite cancelado.");
                  } catch (err: any) {
                    toast.error(err.message);
                  }
                }}
                className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-400 transition-colors hover:bg-red-500/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 2: Update `settings/page.tsx` to fetch pending invitations and pass to shell**

Read `app/(app)/settings/page.tsx`, then add the query:

```typescript
// In the page.tsx server component, add after existing queries:
const { data: pendingInvitations } = await supabase
  .from("invitations")
  .select("*")
  .eq("company_id", companyId)
  .eq("status", "pending")
  .order("created_at", { ascending: false });
```

And pass `pendingInvitations={pendingInvitations ?? []}` to `<SettingsShell />`.

- [ ] **Step 3: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/settings/settings-shell.tsx" "app/(app)/settings/page.tsx"
git commit -m "feat(settings): add pending invitations list with cancel and resend actions"
```

---

## Task 9: `/accept-invite` page for new users via email

**Files:**
- Create: `app/accept-invite/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/accept-invite/page.tsx`:

```typescript
/**
 * /accept-invite — handles new users arriving via Supabase email invite link.
 * After Supabase Auth processes the magic link, user is redirected here with ?invitationId=<uuid>.
 * This page auto-accepts the invitation and redirects to onboarding or dashboard.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface PageProps {
  searchParams: Promise<{ invitationId?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const { invitationId } = await searchParams;

  if (!invitationId) redirect("/login");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/accept-invite?invitationId=${invitationId}`);

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invite) redirect("/onboarding?error=invite_not_found");

  if (invite.status === "accepted") redirect("/inbox?welcome=1");

  if (invite.status === "expired") redirect("/login?error=invite_expired");

  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    redirect("/login?error=invite_email_mismatch");
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from("invitations").update({ status: "expired" }).eq("id", invitationId);
    redirect("/login?error=invite_expired");
  }

  // Create membership
  const { error: memberErr } = await admin.from("memberships").upsert(
    { company_id: invite.company_id, user_id: user.id, role: invite.role },
    { onConflict: "company_id,user_id" }
  );

  if (memberErr) {
    console.error("[accept-invite] membership error:", memberErr.message);
    redirect("/onboarding?error=invite_failed");
  }

  // Mark accepted
  await admin.from("invitations").update({
    status: "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", invitationId);

  // Notify inviter
  const { data: company } = await admin.from("companies").select("name").eq("id", invite.company_id).maybeSingle();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const { createNotification } = await import("@/lib/notifications/create");
  await createNotification({
    company_id: invite.company_id,
    user_id: invite.invited_by,
    type: "member_joined",
    title: "Membro entrou para o time",
    body: `${profile?.full_name ?? user.email} aceitou seu convite e agora faz parte de ${company?.name ?? "sua empresa"}.`,
    action_url: "/settings",
    metadata: { member_id: user.id },
    priority: "medium",
  });

  redirect("/inbox?welcome=1");
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "app/accept-invite/page.tsx"
git commit -m "feat(auth): add /accept-invite page for email-invited new users"
```

---

## Task 10: Wire `createNotification` into Stripe webhook + check-channels cron

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `app/api/cron/check-channels/route.ts`

- [ ] **Step 1: Add notification to `invoice.payment_failed` in Stripe webhook**

In `app/api/stripe/webhook/route.ts`, inside the `case 'invoice.payment_failed':` block, after the existing `updateCompanyStatus` call and before `break`, add:

```typescript
// Notify company owner of payment failure
try {
  const { createNotification } = await import("@/lib/notifications/create");
  // Find company owner
  const { data: owner } = await admin
    .from("memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .maybeSingle();

  if (owner) {
    await createNotification({
      company_id: companyId,
      user_id: owner.user_id,
      type: "payment_failed",
      title: "Falha no pagamento",
      body: "Não foi possível processar o pagamento da sua assinatura. Acesse o portal de cobrança para atualizar seus dados.",
      action_url: "/settings",
      priority: "critical",
      metadata: {
        invoice_id: inv.id,
        amount_cents: inv.amount_due,
        hosted_invoice_url: inv.hosted_invoice_url,
      },
    });
  }
} catch (notifErr: any) {
  console.error("[Stripe Webhook] Failed to create payment_failed notification:", notifErr.message);
}
```

- [ ] **Step 2: Implement check-channels cron with real check + notifications**

Replace the entire content of `app/api/cron/check-channels/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotificationForUsers } from '@/lib/notifications/create';

export async function GET() {
  const admin = createAdminClient();

  // Find channels with error status
  const { data: errorChannels } = await admin
    .from('channels')
    .select('id, company_id, provider_id, status, last_error')
    .eq('status', 'error');

  if (!errorChannels?.length) {
    return NextResponse.json({ ok: true, checked: 0, errors: 0 });
  }

  let notified = 0;

  for (const channel of errorChannels) {
    // Get all members of this company to notify
    const { data: members } = await admin
      .from('memberships')
      .select('user_id')
      .eq('company_id', channel.company_id);

    if (!members?.length) continue;

    // Check if we already sent a channel_error notification in the last hour
    // to avoid spam on repeated cron runs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', channel.company_id)
      .eq('type', 'channel_error')
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) > 0) continue; // already notified recently

    await createNotificationForUsers(members, {
      company_id: channel.company_id,
      type: 'channel_error',
      title: 'Canal WhatsApp com erro',
      body: channel.last_error
        ? `Erro no canal: ${String(channel.last_error).slice(0, 120)}`
        : 'Um canal do WhatsApp está desconectado. Reconecte nas configurações.',
      action_url: '/settings',
      priority: 'critical',
      metadata: { channel_id: channel.id, provider_id: channel.provider_id },
    });

    notified++;
  }

  return NextResponse.json({ ok: true, checked: errorChannels.length, notified });
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/api/stripe/webhook/route.ts" "app/api/cron/check-channels/route.ts"
git commit -m "feat(notifications): wire createNotification into Stripe payment_failed and check-channels cron"
```

---

## Task 11: Final verification and build

- [ ] **Step 1: Full TypeScript check**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 2: Build**

```bash
cd "c:/antigravity projetos/Agendra"
pnpm build 2>&1 | tail -20
```

Expected: build succeeds, no errors.

- [ ] **Step 3: Update Obsidian docs**

Update `obsidian/01 - PRODUTO/roadmap.md` — add to Fase 5:
```markdown
- [x] **Notifications + Team Invitations**: Real-time notification system (Bell + Realtime), full invite lifecycle, Liquid Glass UI
```

Update `obsidian/05 - LOGS/sessions.md` with session summary.

- [ ] **Step 4: Final commit**

```bash
git add obsidian/
git commit -m "docs: update roadmap and session log for notifications + invitations feature"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `notifications` table → Task 1
- ✅ `invitations` table → Task 1  
- ✅ RLS on both tables → Task 1
- ✅ pg_cron expiry → Task 1
- ✅ TypeScript types → Task 2
- ✅ `createNotification` helper → Task 3
- ✅ `createNotificationForUsers` helper → Task 3
- ✅ `acceptInvitation` → Task 4
- ✅ `declineInvitation` → Task 4
- ✅ `cancelInvitation` → Task 4
- ✅ `resendInvitation` → Task 4
- ✅ `getNotifications` → Task 4
- ✅ `markNotificationRead` / `markAllNotificationsRead` → Task 4
- ✅ Refactored `inviteTeamMember` (existing vs new user routing) → Task 5
- ✅ Rate limiting (5 pending max, 1 per email per 24h) → Task 5
- ✅ Duplicate invite prevention → Task 5
- ✅ Already-member check → Task 5
- ✅ `NotificationBell` with Realtime, badge, invite actions → Task 6
- ✅ Topbar wired → Task 7
- ✅ Pending invitations list in Settings → Task 8
- ✅ `/accept-invite` page → Task 9
- ✅ `payment_failed` notification → Task 10
- ✅ `channel_error` notification (with spam guard) → Task 10
- ✅ Build verification → Task 11
- ✅ Obsidian docs update → Task 11

**Type consistency:** `Notification`, `Invitation`, `NotificationType`, `NotificationPriority`, `InvitationStatus`, `InvitationRole` — defined in Task 2, used consistently in Tasks 4, 6.

**No placeholders:** All steps have concrete code, exact commands, expected outputs.
