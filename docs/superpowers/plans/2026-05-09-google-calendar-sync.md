# Google Calendar Bidirectional Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full bidirectional sync between Agendra's `/agenda` and Google Calendar — events created in either system appear in the other, deletions propagate, no double-booking, no holiday/all-day event pollution.

**Architecture:** Agendra→GCal: real-time push on create/delete from `agenda/actions.ts`. GCal→Agendra: Supabase `pg_cron` (every 30 min) + on-demand sync when opening `/agenda` (if stale > 5 min). Sync engine in `lib/calendar/sync.ts` uses incremental `syncToken` to avoid full scans.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + pg_cron + pg_net), Google Calendar API v3, TypeScript, Tailwind CSS, Framer Motion

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/schema_v5_gcal_sync.sql` | Create | DB migration: nullable lead_id, source/status columns, sync token |
| `lib/types/database.ts` | Modify | Add `source`, `gcal_sync_status` to Event type |
| `lib/calendar/google.ts` | Modify | Add `listGCalEvents`, `deleteGCalEvent`, `updateGCalEvent`; fix timezone |
| `lib/calendar/sync.ts` | Create | Core sync engine: GCal→Agendra import with syncToken |
| `app/api/sync/gcal/route.ts` | Create | On-demand sync endpoint (authenticated) |
| `app/api/cron/gcal-sync/route.ts` | Create | Cron endpoint (CRON_SECRET protected) |
| `app/(app)/agenda/actions.ts` | Modify | createEvent/deleteEvent → push to GCal |
| `app/(app)/agenda/page.tsx` | Modify | On-demand sync on load + pass GCal state to client |
| `app/(app)/agenda/agenda-client.tsx` | Modify | Source badges, sync button, mobile layout |
| `lib/ai/tools.ts` | Modify | Fix timezone bug in `handleCheckAvailability` |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/schema_v5_gcal_sync.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/schema_v5_gcal_sync.sql
-- ============================================================
-- Agendra — Schema v5: Google Calendar Sync
-- Execute AFTER schema_v4_ai.sql in Supabase SQL Editor
-- ============================================================

-- Allow events without a lead (external GCal imports have no lead)
ALTER TABLE public.events ALTER COLUMN lead_id DROP NOT NULL;

-- Track whether event originated in Agendra or was imported from GCal
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agendra'
  CHECK (source IN ('agendra', 'gcal'));

-- Track GCal sync status for Agendra-origin events
-- NULL = GCal not connected when event was created
-- 'synced' = successfully pushed to GCal
-- 'pending' = push failed, will retry
-- 'error' = push failed, manual intervention needed
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT DEFAULT NULL
  CHECK (gcal_sync_status IN ('synced', 'pending', 'error'));

-- Incremental sync token from Google Calendar API
-- Stored per company; NULL = next sync will be a full sync
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS gcal_sync_token TEXT;

-- Timestamp of last successful sync (used for on-demand sync trigger)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Index for fast gcal_event_id lookups during sync upsert
CREATE INDEX IF NOT EXISTS events_gcal_event_id_idx
  ON public.events(gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;

-- Index for source filtering (show only GCal events, etc.)
CREATE INDEX IF NOT EXISTS events_source_idx
  ON public.events(company_id, source);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the Supabase MCP tool `apply_migration` with the SQL above, or paste into Supabase Dashboard → SQL Editor and run.

Verify success: run `SELECT column_name FROM information_schema.columns WHERE table_name = 'events'` — should include `source` and `gcal_sync_status`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema_v5_gcal_sync.sql
git commit -m "feat: add schema v5 — GCal sync columns and indexes"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Update Event interface**

Replace the existing `Event` interface (lines 33–43) with:

```typescript
export type EventSource = 'agendra' | 'gcal';
export type GCalSyncStatus = 'synced' | 'pending' | 'error';

export interface Event {
  id: string;
  lead_id: string | null;          // nullable — GCal-origin events have no lead
  company_id: string;
  title: string;
  start_time: string;
  end_time: string;
  gcal_event_id: string | null;
  source: EventSource;             // 'agendra' | 'gcal'
  gcal_sync_status: GCalSyncStatus | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: zero errors related to `Event`. (Other errors unrelated to this task are acceptable at this stage.)

- [ ] **Step 3: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat: update Event type with source and gcal_sync_status fields"
```

---

## Task 3: Extend Google Calendar API Helper

**Files:**
- Modify: `lib/calendar/google.ts`

- [ ] **Step 1: Add `timeZone` to `CalendarEventInput` and fix `createGoogleCalendarEvent`**

Find the `CalendarEventInput` interface and add `timeZone`:

```typescript
export interface CalendarEventInput {
  title: string;
  start: string;       // ISO 8601
  end: string;         // ISO 8601
  description?: string;
  attendeeEmail?: string;
  timeZone?: string;   // IANA timezone, e.g. 'America/Sao_Paulo'
}
```

In `createGoogleCalendarEvent`, find these two lines:
```typescript
    start: { dateTime: event.start },
    end: { dateTime: event.end },
```

Replace with:
```typescript
    start: { dateTime: event.start, timeZone: event.timeZone ?? 'America/Sao_Paulo' },
    end:   { dateTime: event.end,   timeZone: event.timeZone ?? 'America/Sao_Paulo' },
```

- [ ] **Step 2: Add `GCalEvent` interface and `ListGCalEventsResult`**

Add after the existing `BusySlot` interface:

```typescript
// ─── Event Types ──────────────────────────────────────────────────────────────

export interface GCalEventDateTime {
  dateTime?: string;   // ISO 8601 — present for timed events
  date?: string;       // YYYY-MM-DD — present for all-day events (holidays, birthdays)
  timeZone?: string;
}

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start: GCalEventDateTime;
  end: GCalEventDateTime;
  status: 'confirmed' | 'tentative' | 'cancelled';
  transparency?: 'opaque' | 'transparent';
  eventType?: string;
  recurringEventId?: string;
}

export interface ListGCalEventsResult {
  events: GCalEvent[];
  nextSyncToken: string;
}
```

- [ ] **Step 3: Add `listGCalEvents`**

Add after the `getFreeBusySlots` function:

```typescript
// ─── Event Listing (for sync) ─────────────────────────────────────────────────

/**
 * Lists events from a Google Calendar.
 * - Pass `syncToken` for incremental sync (only events changed since last sync).
 * - Pass `timeMin`/`timeMax` for full sync (first time or after syncToken expiry).
 *
 * Throws 'SYNC_TOKEN_EXPIRED' when Google returns 410 Gone.
 * Filters out all-day events (holidays, birthdays) and transparent events.
 */
export async function listGCalEvents(
  refreshToken: string,
  calendarId: string,
  opts: {
    syncToken?: string;
    timeMin?: string;
    timeMax?: string;
  } = {},
): Promise<ListGCalEventsResult> {
  const accessToken = await refreshAccessToken(refreshToken);

  const params = new URLSearchParams({
    singleEvents: 'true',   // expand recurring events into individual instances
    maxResults: '2500',
  });

  if (opts.syncToken) {
    // Incremental: only changes since last sync
    params.set('syncToken', opts.syncToken);
  } else {
    // Full sync: bounded time window
    if (opts.timeMin) params.set('timeMin', opts.timeMin);
    if (opts.timeMax) params.set('timeMax', opts.timeMax);
    params.set('eventTypes', 'default');  // excludes fromGmail, outOfOffice, focusTime
    params.set('orderBy', 'startTime');
  }

  const res = await fetch(
    `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  // 410 Gone = syncToken expired — caller must retry as full sync
  if (res.status === 410) {
    throw new Error('SYNC_TOKEN_EXPIRED');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar list events falhou: ${res.status} — ${body}`);
  }

  const json = (await res.json()) as {
    items: GCalEvent[];
    nextSyncToken: string;
  };

  // Filter out events we should not import:
  // - All-day events (start.date without dateTime) = holidays, birthdays, etc.
  // - Transparent events (shows as "free") = don't block appointment slots
  const filtered = (json.items ?? []).filter((e) => {
    if (!e.start?.dateTime) return false;         // all-day event → skip
    if (e.transparency === 'transparent') return false; // free → skip
    return true;
  });

  return {
    events: filtered,
    nextSyncToken: json.nextSyncToken,
  };
}
```

- [ ] **Step 4: Add `deleteGCalEvent`**

```typescript
/**
 * Deletes an event from Google Calendar.
 * 404 (already deleted) is treated as success.
 */
export async function deleteGCalEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const accessToken = await refreshAccessToken(refreshToken);

  const res = await fetch(
    `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (res.status === 404 || res.ok) return; // 404 = already deleted, that's fine

  const body = await res.text();
  throw new Error(`Google Calendar delete event falhou: ${res.status} — ${body}`);
}
```

- [ ] **Step 5: Add `updateGCalEvent`**

```typescript
/**
 * Updates an existing event in Google Calendar (PATCH — partial update).
 */
export async function updateGCalEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput,
): Promise<void> {
  const accessToken = await refreshAccessToken(refreshToken);

  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description ?? '',
    start: { dateTime: event.start, timeZone: event.timeZone ?? 'America/Sao_Paulo' },
    end:   { dateTime: event.end,   timeZone: event.timeZone ?? 'America/Sao_Paulo' },
  };

  const res = await fetch(
    `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Calendar update event falhou: ${res.status} — ${errBody}`);
  }
}
```

- [ ] **Step 6: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors in `lib/calendar/google.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/calendar/google.ts
git commit -m "feat: add listGCalEvents, deleteGCalEvent, updateGCalEvent; fix timezone in createGoogleCalendarEvent"
```

---

## Task 4: Create Sync Engine

**Files:**
- Create: `lib/calendar/sync.ts`

- [ ] **Step 1: Create the file**

```typescript
/**
 * Google Calendar Sync Engine
 *
 * Syncs one company's Google Calendar into the local `events` table.
 * Uses incremental sync (syncToken) when available; falls back to full sync.
 *
 * Filtering rules (applied in listGCalEvents):
 *   - All-day events (holidays, birthdays) → skipped
 *   - Transparent events (shows as "free") → skipped
 *   - eventType !== 'default' → skipped
 *
 * GCal-origin events (source='gcal') are never pushed back to GCal.
 * Agendra-origin events (source='agendra') keep gcal_event_id for delete propagation.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { listGCalEvents } from '@/lib/calendar/google';

export interface SyncResult {
  skipped?: boolean;
  inserted: number;
  updated: number;
  deleted: number;
  syncToken: string;
}

export async function syncCompanyCalendar(companyId: string): Promise<SyncResult> {
  const admin = createAdminClient();

  const { data: company } = await admin
    .from('companies')
    .select('google_refresh_token, google_calendar_id, gcal_sync_token')
    .eq('id', companyId)
    .single();

  if (!company?.google_refresh_token) {
    return { skipped: true, inserted: 0, updated: 0, deleted: 0, syncToken: '' };
  }

  const calendarId = company.google_calendar_id ?? 'primary';
  const now = new Date();

  let gcalResult: Awaited<ReturnType<typeof listGCalEvents>>;

  const runFullSync = async () => {
    const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    return listGCalEvents(company.google_refresh_token!, calendarId, { timeMin, timeMax });
  };

  try {
    if (company.gcal_sync_token) {
      gcalResult = await listGCalEvents(company.google_refresh_token, calendarId, {
        syncToken: company.gcal_sync_token,
      });
    } else {
      gcalResult = await runFullSync();
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'SYNC_TOKEN_EXPIRED') {
      // Clear stale token and retry as full sync
      await admin.from('companies').update({ gcal_sync_token: null }).eq('id', companyId);
      gcalResult = await runFullSync();
    } else {
      throw err;
    }
  }

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const gcalEvent of gcalResult.events) {
    // Cancelled events: remove from Agendra only if GCal-origin
    if (gcalEvent.status === 'cancelled') {
      const { error } = await admin
        .from('events')
        .delete()
        .eq('gcal_event_id', gcalEvent.id)
        .eq('company_id', companyId)
        .eq('source', 'gcal');

      if (!error) deleted++;
      continue;
    }

    // Safety: skip if no dateTime (all-day, already filtered but double-check)
    if (!gcalEvent.start?.dateTime || !gcalEvent.end?.dateTime) continue;

    const title = gcalEvent.summary?.trim() || 'Evento sem título';
    const startTime = gcalEvent.start.dateTime;
    const endTime = gcalEvent.end.dateTime;

    // Check if event already exists in Agendra
    const { data: existing } = await admin
      .from('events')
      .select('id, title, start_time, end_time')
      .eq('gcal_event_id', gcalEvent.id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (existing) {
      // Update only if something changed (avoid unnecessary writes)
      if (
        existing.title !== title ||
        existing.start_time !== startTime ||
        existing.end_time !== endTime
      ) {
        await admin
          .from('events')
          .update({ title, start_time: startTime, end_time: endTime })
          .eq('id', existing.id);
        updated++;
      }
    } else {
      // Insert new GCal-origin event
      await admin.from('events').insert({
        company_id: companyId,
        lead_id: null,               // GCal events have no associated lead
        title,
        start_time: startTime,
        end_time: endTime,
        gcal_event_id: gcalEvent.id,
        source: 'gcal',
        gcal_sync_status: null,      // GCal is source of truth for these events
      });
      inserted++;
    }
  }

  // Persist new syncToken and timestamp
  await admin
    .from('companies')
    .update({
      gcal_sync_token: gcalResult.nextSyncToken,
      last_synced_at: now.toISOString(),
    })
    .eq('id', companyId);

  return { inserted, updated, deleted, syncToken: gcalResult.nextSyncToken };
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: zero errors in `lib/calendar/sync.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/calendar/sync.ts
git commit -m "feat: add GCal sync engine with incremental syncToken support"
```

---

## Task 5: On-Demand Sync API Route

**Files:**
- Create: `app/api/sync/gcal/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * GET /api/sync/gcal
 *
 * Triggers an immediate GCal sync for the authenticated user's company.
 * Called by the "Sincronizar agora" button in /agenda.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { syncCompanyCalendar } from '@/lib/calendar/sync';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (updates) => {
          for (const { name, value, options } of updates) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (!membership?.company_id) {
    return NextResponse.json({ error: 'No company' }, { status: 400 });
  }

  try {
    const result = await syncCompanyCalendar(membership.company_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Sync/GCal] On-demand sync failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sync/gcal/route.ts
git commit -m "feat: add on-demand GCal sync API route"
```

---

## Task 6: Cron Endpoint + Supabase pg_cron Setup

**Files:**
- Create: `app/api/cron/gcal-sync/route.ts`

- [ ] **Step 1: Add `CRON_SECRET` env var**

In `.env.local`, add:
```
CRON_SECRET=<generate a random 32+ char string, e.g. via: openssl rand -base64 32>
```

Also add to Vercel environment variables (Dashboard → Project → Settings → Environment Variables).

- [ ] **Step 2: Create the cron route**

```typescript
/**
 * POST /api/cron/gcal-sync
 *
 * Called by Supabase pg_cron every 30 minutes.
 * Syncs GCal for ALL companies that have Google Calendar connected.
 * Protected by CRON_SECRET header — never expose this endpoint publicly without auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCompanyCalendar } from '@/lib/calendar/sync';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron/GCal] CRON_SECRET env var not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: companies, error } = await admin
    .from('companies')
    .select('id')
    .not('google_refresh_token', 'is', null);

  if (error) {
    console.error('[Cron/GCal] Failed to fetch companies:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ ok: true, message: 'No companies with GCal connected', synced: 0 });
  }

  // Run syncs sequentially to avoid overwhelming GCal API rate limits
  // One company failing must not stop others
  const summary = { synced: 0, skipped: 0, inserted: 0, updated: 0, deleted: 0, errors: 0 };

  for (const company of companies) {
    try {
      const result = await syncCompanyCalendar(company.id);
      if (result.skipped) {
        summary.skipped++;
      } else {
        summary.synced++;
        summary.inserted += result.inserted;
        summary.updated += result.updated;
        summary.deleted += result.deleted;
      }
    } catch (err) {
      summary.errors++;
      console.error(`[Cron/GCal] Sync failed for company ${company.id}:`, err);
    }
  }

  console.log('[Cron/GCal] Sync complete:', summary);
  return NextResponse.json({ ok: true, ...summary });
}
```

- [ ] **Step 3: Set up Supabase pg_cron**

In Supabase Dashboard → Database → Extensions, enable:
- `pg_cron`
- `pg_net`

Then in Supabase Dashboard → SQL Editor, run:

```sql
-- Set your app URL and cron secret as Supabase config vars
ALTER DATABASE postgres SET "app.settings.api_url" = 'https://YOUR_APP_URL';
ALTER DATABASE postgres SET "app.settings.cron_secret" = 'YOUR_CRON_SECRET_HERE';

-- Schedule sync every 30 minutes
SELECT cron.schedule(
  'agendra-gcal-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url        := current_setting('app.settings.api_url') || '/api/cron/gcal-sync',
    headers    := jsonb_build_object(
                    'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
                    'Content-Type', 'application/json'
                  ),
    body       := '{}'::jsonb
  )
  $$
);

-- Verify schedule was created:
SELECT * FROM cron.job WHERE jobname = 'agendra-gcal-sync';
```

Replace `YOUR_APP_URL` with your Vercel deployment URL (e.g. `agendra.vercel.app`), and `YOUR_CRON_SECRET_HERE` with the same value as `CRON_SECRET` in your env vars.

- [ ] **Step 4: Verify types compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/gcal-sync/route.ts
git commit -m "feat: add GCal cron sync endpoint with CRON_SECRET auth"
```

---

## Task 7: Fix agenda/actions.ts — GCal Propagation

**Files:**
- Modify: `app/(app)/agenda/actions.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/utils";
import { createGoogleCalendarEvent, deleteGCalEvent } from "@/lib/calendar/google";

export async function createEvent(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const leadId = (formData.get("lead_id") as string | null)?.trim() || null;
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const startTime = (formData.get("start_time") as string | null)?.trim() ?? "";
  const endTime = (formData.get("end_time") as string | null)?.trim() ?? "";

  if (!title || title.length > 300) throw new Error("Título inválido");
  if (leadId && !isValidUuid(leadId)) throw new Error("lead_id inválido");

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Data/hora inválida");
  }
  if (end <= start) throw new Error("end_time deve ser posterior a start_time");

  const supabase = await createClient();

  // Insert into DB first
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      company_id: companyId,
      lead_id: leadId,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      source: "agendra",
    })
    .select("id")
    .single();

  if (error || !event) throw new Error(error?.message ?? "Falha ao criar evento");

  // Push to Google Calendar if company has it connected
  const { data: company } = await supabase
    .from("companies")
    .select("google_refresh_token, google_calendar_id")
    .eq("id", companyId)
    .single();

  if (company?.google_refresh_token) {
    try {
      const gcalEventId = await createGoogleCalendarEvent(
        company.google_refresh_token,
        company.google_calendar_id ?? "primary",
        {
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          description: `Agendado via Agendra`,
        },
      );

      await supabase
        .from("events")
        .update({ gcal_event_id: gcalEventId, gcal_sync_status: "synced" })
        .eq("id", event.id);
    } catch (err) {
      // Don't block the user — mark as error for later retry
      console.error("[createEvent] GCal push failed:", err);
      await supabase
        .from("events")
        .update({ gcal_sync_status: "error" })
        .eq("id", event.id);
    }
  }

  revalidatePath("/agenda");
}

export async function deleteEvent(eventId: string) {
  if (!isValidUuid(eventId)) throw new Error("eventId inválido");

  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const supabase = await createClient();

  // Fetch event before delete to get gcal_event_id and source
  const { data: eventData } = await supabase
    .from("events")
    .select("gcal_event_id, source")
    .eq("id", eventId)
    .eq("company_id", companyId)
    .single();

  // Propagate deletion to GCal only for Agendra-origin events
  // (GCal-origin events have no delete button in UI, but guard here anyway)
  if (eventData?.gcal_event_id && eventData.source === "agendra") {
    const { data: company } = await supabase
      .from("companies")
      .select("google_refresh_token, google_calendar_id")
      .eq("id", companyId)
      .single();

    if (company?.google_refresh_token) {
      try {
        await deleteGCalEvent(
          company.google_refresh_token,
          company.google_calendar_id ?? "primary",
          eventData.gcal_event_id,
        );
      } catch (err) {
        // Silent — don't block deletion from Agendra if GCal fails
        console.error("[deleteEvent] GCal delete failed:", err);
      }
    }
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath("/agenda");
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/agenda/actions.ts
git commit -m "feat: propagate event create/delete to Google Calendar from agenda actions"
```

---

## Task 8: Fix Timezone Bug in AI Tools

**Files:**
- Modify: `lib/ai/tools.ts`

The bug: `handleCheckAvailability` uses `cursor.getDay()` (UTC day-of-week) and `cursor.setHours()` (UTC hours) to compare with working hours like `"09:00"` which represent local time. Events get offered at wrong times.

- [ ] **Step 1: Add timezone helper at the top of `handleCheckAvailability`**

Find the `handleCheckAvailability` function. Before the `while` loop, after the `busyIntervals` array is constructed, add this helper function (inside the `handleCheckAvailability` function scope):

```typescript
  // Returns the UTC offset in minutes for a given timezone at a given UTC moment.
  // e.g., America/Sao_Paulo (UTC-3) returns -180
  function getOffsetMinutes(utcDate: Date, tz: string): number {
    const utcStr = utcDate.toLocaleString('en-CA', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const localStr = utcDate.toLocaleString('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return (new Date(localStr.replace(' ', 'T')).getTime() -
            new Date(utcStr.replace(' ', 'T')).getTime()) / 60000;
  }
```

- [ ] **Step 2: Replace the cursor/working-hours block**

Find and replace the entire `while` loop in `handleCheckAvailability` (starting with `while (cursor < rangeEnd && availableSlots.length < 10)`) with:

```typescript
  while (cursor < rangeEnd && availableSlots.length < 10) {
    // Convert cursor to local time for day-of-week and hour comparison
    const offsetMs = getOffsetMinutes(cursor, timezone) * 60000;
    const localCursor = new Date(cursor.getTime() + offsetMs);
    const localDayOfWeek = localCursor.getUTCDay(); // 0=Sun in local time
    const localHour = localCursor.getUTCHours();
    const localMinute = localCursor.getUTCMinutes();

    const dayKey = dayNames[localDayOfWeek];
    const hours = workingHours[dayKey];

    if (hours) {
      const [startHH, startMM] = hours[0].split(':').map(Number);
      const [endHH, endMM] = hours[1].split(':').map(Number);
      const localMinutes = localHour * 60 + localMinute;
      const workStart = startHH * 60 + startMM;
      const workEnd = endHH * 60 + endMM;
      const slotEndLocalMinutes = localMinutes + slotDuration;

      if (localMinutes >= workStart && slotEndLocalMinutes <= workEnd) {
        const slotEnd = new Date(cursor.getTime() + slotDuration * 60000);

        const isBusy = busyIntervals.some(
          (busy) => new Date(busy.start) < slotEnd && new Date(busy.end) > cursor,
        );

        if (!isBusy) {
          const pad = (n: number) => String(n).padStart(2, '0');
          const label = `${ptDays[dayKey]}, ${pad(localCursor.getUTCDate())} ${ptMonths[localCursor.getUTCMonth()]} · ${pad(localHour)}:${pad(localMinute)}–${pad(Math.floor(slotEndLocalMinutes / 60))}:${pad(slotEndLocalMinutes % 60)}`;
          availableSlots.push({ start: cursor.toISOString(), end: slotEnd.toISOString(), label });
        }
      }

      // Advance by slot duration
      cursor = new Date(cursor.getTime() + slotDuration * 60000);

      // If we've gone past working hours, jump to next local midnight
      const newLocalMinutes = slotEndLocalMinutes;
      if (newLocalMinutes >= workEnd) {
        // Jump to start of next local day (midnight UTC adjusted for timezone)
        const nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
        nextLocalMidnight.setUTCHours(0, 0, 0, 0);
        cursor = new Date(nextLocalMidnight.getTime() - offsetMs);
      }
    } else {
      // Non-working day — jump to next local day
      const nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
      nextLocalMidnight.setUTCHours(0, 0, 0, 0);
      cursor = new Date(nextLocalMidnight.getTime() - offsetMs);
    }
  }
```

- [ ] **Step 3: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: zero errors in `lib/ai/tools.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools.ts
git commit -m "fix: use timezone-aware local time in checkAvailability working hours calculation"
```

---

## Task 9: Update agenda/page.tsx — On-Demand Sync + GCal State

**Files:**
- Modify: `app/(app)/agenda/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AgendaClient } from "./agenda-client";
import { syncCompanyCalendar } from "@/lib/calendar/sync";

export default async function AgendaPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  // Fetch company GCal state alongside events
  const now = new Date();
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();

  const [{ data: events, error }, { data: leads }, { data: company }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_time, end_time, lead_id, source, gcal_event_id, gcal_sync_status, leads(name, status, phone)")
      .eq("company_id", companyId)
      .gte("start_time", startOfPrevMonth)
      .lte("start_time", endOfNextMonth)
      .order("start_time", { ascending: true }),
    supabase
      .from("leads")
      .select("id, name, status, phone")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("companies")
      .select("google_refresh_token, google_calendar_id, google_calendar_email, last_synced_at")
      .eq("id", companyId)
      .single(),
  ]);

  if (error) {
    console.error("[AgendaPage] fetch error:", error.message);
  }

  // On-demand sync: if GCal connected and last sync > 5 min ago (or never synced)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const needsSync =
    company?.google_refresh_token &&
    (!company.last_synced_at || new Date(company.last_synced_at) < fiveMinAgo);

  if (needsSync) {
    // Timeout guard: if GCal API takes > 8s, skip and render with stale data
    await Promise.race([
      syncCompanyCalendar(companyId),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("sync timeout")), 8000)
      ),
    ]).catch((err) => {
      console.warn("[AgendaPage] On-demand sync skipped:", err.message);
    });

    // Re-fetch events after sync (sync inserted new rows)
    const { data: freshEvents } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, lead_id, source, gcal_event_id, gcal_sync_status, leads(name, status, phone)")
      .eq("company_id", companyId)
      .gte("start_time", startOfPrevMonth)
      .lte("start_time", endOfNextMonth)
      .order("start_time", { ascending: true });

    return (
      <AgendaClient
        events={freshEvents ?? []}
        leads={leads ?? []}
        companyId={companyId}
        gcalConnected={!!company?.google_refresh_token}
        gcalEmail={company?.google_calendar_email ?? null}
        lastSyncedAt={new Date().toISOString()}
      />
    );
  }

  return (
    <AgendaClient
      events={events ?? []}
      leads={leads ?? []}
      companyId={companyId}
      gcalConnected={!!company?.google_refresh_token}
      gcalEmail={company?.google_calendar_email ?? null}
      lastSyncedAt={company?.last_synced_at ?? null}
    />
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/agenda/page.tsx
git commit -m "feat: add on-demand GCal sync on agenda page load with 8s timeout guard"
```

---

## Task 10: Update agenda-client.tsx — UI + Mobile Layout

**Files:**
- Modify: `app/(app)/agenda/agenda-client.tsx`

This task updates the client component to:
1. Accept new props (`gcalConnected`, `gcalEmail`, `lastSyncedAt`)
2. Show visual distinction for GCal-origin events
3. Add "Sincronizar" button
4. Optimize layout for mobile

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X,
  Trash2, Loader2, RefreshCw, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createEvent, deleteEvent } from "./actions";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DOW = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

type LeadStatus = "hot" | "warm" | "cold" | "success";
type EventSource = "agendra" | "gcal";
type GCalSyncStatus = "synced" | "pending" | "error" | null;

interface EventLead {
  name: string;
  status: LeadStatus;
  phone: string;
}

interface AgendaEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  lead_id: string | null;
  source: EventSource;
  gcal_event_id: string | null;
  gcal_sync_status: GCalSyncStatus;
  leads: EventLead | null;
}

interface LeadOption {
  id: string;
  name: string;
  status: LeadStatus;
  phone: string;
}

interface AgendaClientProps {
  events: AgendaEvent[];
  leads: LeadOption[];
  companyId: string;
  gcalConnected: boolean;
  gcalEmail: string | null;
  lastSyncedAt: string | null;
}

const HEAT_COLOR: Record<LeadStatus, string> = {
  hot: "#F97316",
  warm: "#F59E0B",
  cold: "#60A5FA",
  success: "#14B8A6",
};

const HEAT_LABEL: Record<LeadStatus, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  success: "Convertido",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRelativeSync(isoString: string | null): string {
  if (!isoString) return "Nunca sincronizado";
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "Agora mesmo";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export function AgendaClient({
  events,
  leads,
  gcalConnected,
  lastSyncedAt,
}: AgendaClientProps) {
  const TODAY = new Date();
  const router = useRouter();
  const [viewYear, setViewYear] = useState(TODAY.getFullYear());
  const [viewMonth, setViewMonth] = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(TODAY.getDate());
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState(() => formatRelativeSync(lastSyncedAt));

  const eventsByDay = useMemo(() => {
    const map: Record<number, AgendaEvent[]> = {};
    for (const ev of events) {
      const d = new Date(ev.start_time);
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(ev);
      }
    }
    return map;
  }, [events, viewYear, viewMonth]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();

    const arr: { d: number; muted: boolean }[] = [];
    for (let i = 0; i < startDow; i++) {
      arr.push({ d: prevDays - startDow + 1 + i, muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) arr.push({ d, muted: false });
    while (arr.length % 7 !== 0) arr.push({ d: arr.length - daysInMonth - startDow + 1, muted: true });
    return arr;
  }, [viewYear, viewMonth]);

  const dayEvents = (eventsByDay[selected] || []).slice().sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const navMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const handleCreate = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await createEvent(formData);
        setShowModal(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar agendamento");
      }
    });
  };

  const handleDelete = (eventId: string) => {
    startTransition(async () => {
      try {
        await deleteEvent(eventId);
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/gcal");
      if (res.ok) {
        setSyncLabel("Agora mesmo");
        router.refresh();
      }
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [router]);

  const defaultDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selected).padStart(2, "0")}`;

  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.02em] sm:text-[28px]">Agenda</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
            {dayEvents.length} evento{dayEvents.length === 1 ? "" : "s"} em {selected} de {MONTHS[viewMonth]}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gcalConnected && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
              className="gap-1.5 text-xs"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">
                {isSyncing ? "Sincronizando..." : `Sincronizar · ${syncLabel}`}
              </span>
              <span className="sm:hidden">
                {isSyncing ? "..." : "Sync"}
              </span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setViewYear(TODAY.getFullYear());
              setViewMonth(TODAY.getMonth());
              setSelected(TODAY.getDate());
            }}
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Hoje</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            <span className="hidden sm:inline">Novo agendamento</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </header>

      {/* Calendar grid + day panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Calendar grid */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 text-base font-semibold sm:text-lg">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => navMonth(-1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Mês anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navMonth(1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Próximo mês"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {DOW.map((d) => (
              <div
                key={d}
                className="py-1 text-center font-mono text-[9px] font-medium uppercase tracking-[0.12em] sm:text-[10px] sm:tracking-[0.16em]"
                style={{ color: "var(--color-fg-3)" }}
              >
                {d}
              </div>
            ))}
            {cells.map((c, i) => {
              const evs = !c.muted ? eventsByDay[c.d] || [] : [];
              const isToday = !c.muted && c.d === TODAY.getDate() && viewMonth === TODAY.getMonth() && viewYear === TODAY.getFullYear();
              const isSel = !c.muted && c.d === selected;
              return (
                <motion.button
                  key={i}
                  whileHover={c.muted ? undefined : { scale: 1.04 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  onClick={() => !c.muted && setSelected(c.d)}
                  className={cn(
                    "flex aspect-square cursor-pointer flex-col gap-0.5 rounded-lg border p-1.5 text-left sm:rounded-xl sm:p-2",
                    "border-white/[0.08] bg-white/[0.02] transition-colors",
                    !c.muted && "hover:bg-white/[0.05]",
                    c.muted && "opacity-30",
                    isToday && "border-[#2563EB]/50 bg-[#2563EB]/10",
                    isSel && "border-[#F97316]/50 !bg-[#F97316]/10",
                  )}
                >
                  <span className="text-[11px] font-semibold sm:text-[13px]">{c.d}</span>
                  <span className="mt-auto flex gap-0.5 flex-wrap">
                    {evs.slice(0, 3).map((e, j) => {
                      const color = e.source === "gcal"
                        ? "#818CF8"  // indigo for GCal-origin
                        : HEAT_COLOR[e.leads?.status ?? "cold"];
                      return (
                        <span
                          key={j}
                          className="h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5"
                          style={{ background: color }}
                        />
                      );
                    })}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Day events panel */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 sm:p-5">
          <div className="eyebrow mb-3 text-[11px]">
            Dia {selected} · {MONTHS[viewMonth]}
          </div>
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto sm:max-h-[calc(100vh-260px)] sm:gap-2.5">
            {dayEvents.length === 0 ? (
              <div
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 text-center"
                style={{ color: "var(--color-fg-3)" }}
              >
                <p className="text-sm">Sem agendamentos neste dia.</p>
                <p className="mt-1 text-[11px]">Clique em "Novo" para adicionar.</p>
              </div>
            ) : (
              dayEvents.map((e, i) => {
                const isGcal = e.source === "gcal";
                const status = e.leads?.status ?? "cold";
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border p-3 sm:gap-3",
                      isGcal
                        ? "border-indigo-500/20 bg-indigo-500/[0.06]"
                        : "border-white/[0.08] bg-white/[0.04]",
                    )}
                  >
                    <span className="min-w-[44px] font-mono text-xs font-semibold text-brand-teal-300 sm:min-w-[50px]">
                      {formatTime(e.start_time)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[12px] font-semibold sm:text-[13px]">{e.title}</div>
                      {e.leads?.name && (
                        <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                          {e.leads.name} · {e.leads.phone}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {isGcal && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-indigo-300">
                            <ExternalLink size={9} />
                            Google Calendar
                          </span>
                        )}
                        {!isGcal && e.gcal_sync_status === "error" && (
                          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-300">
                            ⚠ Sync pendente
                          </span>
                        )}
                        {!isGcal && e.leads?.status && (
                          <Badge variant={status} className="px-2 py-0.5 text-[10px]">
                            {HEAT_LABEL[status]}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {/* Only Agendra-origin events can be deleted */}
                    {!isGcal && (
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg transition hover:bg-white/[0.08] hover:text-red-400"
                        style={{ color: "var(--color-fg-3)" }}
                        aria-label="Excluir"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal — Novo Agendamento */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            >
              <div className="w-full max-w-md rounded-t-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.98)] p-6 shadow-2xl backdrop-blur-xl sm:rounded-2xl sm:max-h-[90vh] overflow-y-auto">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Novo agendamento</h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/[0.08] hover:text-white"
                    style={{ color: "var(--color-fg-3)" }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <form action={handleCreate} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                      Título / motivo *
                    </label>
                    <input
                      name="title"
                      required
                      placeholder="Ex: Consulta inicial, Retorno..."
                      className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                      Lead (opcional)
                    </label>
                    <select
                      name="lead_id"
                      className="rounded-xl border border-white/[0.08] bg-[rgba(11,18,34,0.9)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50"
                    >
                      <option value="">— Nenhum lead vinculado —</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                        Início *
                      </label>
                      <input
                        name="start_time"
                        type="datetime-local"
                        required
                        defaultValue={`${defaultDate}T09:00`}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                        Fim *
                      </label>
                      <input
                        name="end_time"
                        type="datetime-local"
                        required
                        defaultValue={`${defaultDate}T10:00`}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      {error}
                    </p>
                  )}

                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={() => setShowModal(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="flex-1 justify-center"
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      {isPending ? "Salvando..." : "Criar"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/agenda/agenda-client.tsx
git commit -m "feat: add GCal event badges, sync button, and mobile layout to agenda UI"
```

---

## Task 11: Build Verification + Deployment Check

- [ ] **Step 1: Run full TypeScript check**

```bash
pnpm tsc --noEmit
```

Expected: zero errors. Fix any remaining type errors before continuing.

- [ ] **Step 2: Run production build**

```bash
pnpm run build
```

Expected: build completes with no errors. Common issues to watch for:
- `"use client"` components importing server-only modules (e.g., `lib/supabase/admin`)
- Dynamic route handlers without `export const dynamic = 'force-dynamic'` when needed
- Missing env vars referenced in build-time code

If build fails with **"Module not found"**: check import paths in new files.

If build fails with **"Server Actions must be async functions"**: verify all exported functions in `actions.ts` are `async`.

If build fails with **missing env var**: the route handlers reference `CRON_SECRET` at request time (not build time), so this should not affect build.

- [ ] **Step 3: Test on mobile (browser DevTools)**

Open `http://localhost:3000/agenda` with DevTools → Toggle Device Toolbar → iPhone SE (375px width).

Verify:
- Calendar grid fills width, cells are tap-sized (≥ 32px)
- Day events panel stacks below calendar (not side-by-side)
- Header buttons wrap cleanly, "Sincronizar" truncates to "Sync" on narrow screens
- "Novo" modal slides up from bottom on mobile, scrollable if content overflows
- No horizontal overflow (no sideways scroll)

- [ ] **Step 4: Test GCal sync flow manually**

Prerequisite: Company must have Google Calendar connected (go to `/settings` → Channels → Conectar).

Manual test sequence:
1. Create an event in Google Calendar (not Agendra)
2. Open `/agenda` — should trigger on-demand sync (first load after connecting)
3. Verify the event appears with indigo "Google Calendar" badge
4. Create an event in Agendra via modal
5. Verify the event appears in Google Calendar within seconds
6. Delete the Agendra event → verify it disappears from Google Calendar
7. Click "Sincronizar" button → verify spinner, then label updates to "Agora mesmo"

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: verify build and mobile layout for GCal sync feature"
```

---

## Post-Implementation: Supabase pg_cron Verification

After deploying to Vercel:

```sql
-- Check cron job is registered
SELECT jobname, schedule, active FROM cron.job;

-- Manually trigger one run to verify connectivity
SELECT cron.run_job('agendra-gcal-sync');

-- Check execution history (after a few runs)
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

If `pg_net.http_post` fails with connection error, verify:
1. `app.settings.api_url` is set to the production URL (not localhost)
2. `app.settings.cron_secret` matches `CRON_SECRET` in Vercel env vars
3. The `/api/cron/gcal-sync` route is deployed and reachable

---

## Self-Review Notes

**Spec coverage:**
- ✅ DB migration (Task 1)
- ✅ Types updated (Task 2)
- ✅ `listGCalEvents` + `deleteGCalEvent` + `updateGCalEvent` + timezone fix (Task 3)
- ✅ Sync engine with syncToken + full sync fallback + 410 handling (Task 4)
- ✅ On-demand sync endpoint (Task 5)
- ✅ Cron endpoint with CRON_SECRET (Task 6)
- ✅ pg_cron setup documented (Task 6)
- ✅ createEvent → GCal push + gcal_sync_status (Task 7)
- ✅ deleteEvent → GCal delete propagation (Task 7)
- ✅ Timezone fix in handleCheckAvailability (Task 8)
- ✅ On-demand sync in page.tsx with 8s timeout (Task 9)
- ✅ GCal event badges, sync button, mobile layout (Task 10)
- ✅ Holiday/all-day event filtering (Task 3 listGCalEvents + Task 4 safety check)
- ✅ GCal-origin events: no delete button in UI (Task 10)
- ✅ Build verification + mobile testing (Task 11)
- ✅ Agendra-origin events: GCal delete propagation (Task 7)
