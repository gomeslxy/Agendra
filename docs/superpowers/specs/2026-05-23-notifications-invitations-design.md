# Notifications + Team Invitations — Design Spec

## Goal
Build a complete, real-time notification system and polished team invitation flow for Agendra. Notifications persist in DB, survive page reloads, deliver in <1s via Supabase Realtime. Invitations have full lifecycle management (send, accept, decline, cancel, expire, resend).

---

## 1. Database Schema

### `notifications` table
```sql
id            UUID PK DEFAULT uuid_generate_v4()
company_id    UUID NOT NULL FK companies (multitenant isolation)
user_id       UUID NOT NULL FK auth.users (recipient)
type          TEXT CHECK IN ('invite', 'member_joined', 'member_left', 'channel_error', 'payment_failed', 'lead_hot', 'system')
title         TEXT NOT NULL
body          TEXT NOT NULL
action_url    TEXT                  -- deep-link to relevant context
metadata      JSONB DEFAULT '{}'    -- type-specific extra data
priority      TEXT CHECK IN ('low','medium','high','critical') DEFAULT 'medium'
read          BOOLEAN DEFAULT false
created_at    TIMESTAMPTZ DEFAULT now()
```
RLS: `user_id = auth.uid()` for SELECT/UPDATE. `service_role` for INSERT (server actions use admin client or service_role).

### `invitations` table
```sql
id            UUID PK DEFAULT uuid_generate_v4()
company_id    UUID NOT NULL FK companies
invited_email TEXT NOT NULL
invited_by    UUID NOT NULL FK auth.users
role          TEXT CHECK IN ('admin','member') DEFAULT 'member'
status        TEXT CHECK IN ('pending','accepted','declined','expired','cancelled') DEFAULT 'pending'
expires_at    TIMESTAMPTZ DEFAULT now() + interval '7 days'
notification_id UUID FK notifications (nullable) -- the in-app notification created
accepted_at   TIMESTAMPTZ
created_at    TIMESTAMPTZ DEFAULT now()
```
Unique partial index: `(company_id, invited_email)` WHERE `status = 'pending'` — prevents duplicate active invite.

---

## 2. Notification Types & Triggers

| Type | Trigger point | Recipient |
|------|---------------|-----------|
| `invite` | `inviteTeamMember` action | Invited user (if account exists) |
| `member_joined` | `acceptInvitation` action | Admin who sent invite |
| `member_left` | `declineInvitation` action | Admin who sent invite |
| `channel_error` | `check-channels` cron | All members of company |
| `payment_failed` | Stripe webhook `invoice.payment_failed` | Company owner |
| `lead_hot` | Future — out of scope for this sprint | — |
| `system` | Any server action for critical alerts | Specific user |

---

## 3. Invitation Flow

### New user (no account yet)
1. Admin calls `inviteTeamMember(email, role)`
2. Check `invitations` — reject if pending invite exists for this email+company
3. Check rate limit: max 5 pending invites per company at once
4. Insert row in `invitations` (status='pending')
5. Call `admin.auth.admin.inviteUserByEmail(email, { redirectTo: /accept-invite?invitationId=<id> })`
6. No in-app notification created (user has no account yet)
7. On `/accept-invite` page load: auto-accept the invitation, create membership, redirect to onboarding

### Existing user (has account)
1. Admin calls `inviteTeamMember(email, role)`
2. Same rate limit checks
3. Insert row in `invitations` (status='pending')
4. Look up `auth.users` by email → get `user_id`
5. Create `notification` (type='invite', user_id=found user, metadata={invitation_id, inviter_name, company_name, role})
6. Link `invitations.notification_id = notification.id`
7. Supabase Realtime delivers to Bell in <1s
8. User clicks Accept → `acceptInvitation(invitationId)` server action
9. Validates: invitation exists, not expired, status=pending, email matches auth.uid() email
10. Creates `memberships` row
11. Sets `invitations.status='accepted'`, `accepted_at=now()`
12. Sets `notification.read=true`
13. Creates `notification` for admin (type='member_joined')

### Decline
1. User clicks Decline → `declineInvitation(invitationId)`
2. Sets `invitations.status='declined'`
3. Sets `notification.read=true`
4. Creates `notification` for admin (type='member_left')

### Cancel (admin side)
1. Admin clicks cancel pending invite → `cancelInvitation(invitationId)`
2. Validates caller is admin/owner of that company
3. Sets `invitations.status='cancelled'`
4. Soft-deletes linked notification if unread

### Resend
1. Admin clicks resend → `resendInvitation(invitationId)`
2. Validates status is 'pending' or 'expired'
3. Rate limit: max 1 resend per email per 24h (check `created_at` of existing invitation)
4. If expired: reset `expires_at = now() + 7 days`, `status='pending'`
5. Re-sends Supabase email OR re-creates in-app notification

### Expiration
- `pg_cron` job nightly: `UPDATE invitations SET status='expired' WHERE expires_at < now() AND status='pending'`

---

## 4. Bell UI — NotificationBell component

**Location:** `components/app/notification-bell.tsx` (replaces inline Bell stub in Topbar)

**Behavior:**
- Renders Bell icon with red badge showing unread count (capped at "9+")
- On mount: fetches last 10 notifications via server action `getNotifications()`
- Subscribes to Supabase Realtime `postgres_changes` on `notifications` table filtered by `user_id`
- New notification arrives → prepend to list, increment unread count, pulse animation on badge
- Click bell → panel opens (Framer Motion fade-up + scale)
- Click outside → panel closes
- "Mark all read" button → `markAllNotificationsRead()` server action → batch UPDATE

**Panel layout:**
```
┌─────────────────────────────────────────┐
│  Notificações              [Marcar lidas]│
├─────────────────────────────────────────┤
│ [priority dot] [title]      [timestamp] │
│  [body text]                            │
│  [action buttons if type=invite]        │
├─────────────────────────────────────────┤
│ ... more items ...                      │
└─────────────────────────────────────────┘
```

**Invite notification card** has two inline buttons: "Aceitar ✓" and "Recusar ✗". On action:
- Optimistic UI: card collapses immediately
- Server action fires in background
- Error: card re-appears with error toast

**Priority colors:**
- `critical` → red dot + red tint background
- `high` → orange dot
- `medium` → blue dot
- `low` → gray dot

**Timestamps:** human-relative ("há 2 min", "há 1 hora", "ontem")

---

## 5. Settings — Invitations UI

In `/settings` → "Conta & Empresa" tab, below the team members list:

**Pending invitations section** shows:
- Email, role, sent date, expiration countdown
- "Cancelar" button per invite
- "Reenviar" button (only if expires soon or was declined)

**Invite modal** (already exists): enhance to show duplicate/rate-limit errors clearly.

---

## 6. Security

- All notification reads: RLS `user_id = auth.uid()`
- `acceptInvitation`: validates `invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())`
- `cancelInvitation`: validates `company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid() AND role IN ('admin','owner'))`
- `inviteTeamMember`: validates caller role is 'admin' or 'owner'
- Rate limits checked server-side in actions, not just client
- Invitation IDs (UUIDs) used in URLs — no sequential enumeration possible
- No email addresses logged in server logs

---

## 7. Files Touched

**New:**
- `supabase/migrations/042_notifications_invitations.sql`
- `lib/notifications/create.ts`
- `components/app/notification-bell.tsx`
- `app/(app)/settings/invitations/actions.ts`
- `app/accept-invite/page.tsx`

**Modified:**
- `components/app/topbar.tsx` — replace Bell stub with `<NotificationBell />`
- `app/(app)/settings/actions.ts` — refactor `inviteTeamMember`
- `app/(app)/settings/settings-shell.tsx` — pending invites UI section
- `app/api/stripe/webhook/route.ts` — `createNotification` on `invoice.payment_failed`
- `app/api/cron/check-channels/route.ts` — `createNotification` on channel error
- `lib/types/database.ts` — add Notification + Invitation types
