# Google Calendar Sync — Design Spec
**Date:** 2026-05-09  
**Status:** Approved  
**Scope:** Bidirectional sync between Agendra events and Google Calendar

---

## Problem Statement

Current integration is broken/incomplete:
- Events created manually in `/agenda` never go to Google Calendar
- Events created via AI (`handleBookMeeting`) go to GCal but are missing timezone → wrong time
- No events from GCal ever appear in Agendra
- No delete propagation in either direction
- `events.lead_id` is NOT NULL → external GCal events can't be stored
- Working hours timezone calculation in `handleCheckAvailability` uses raw UTC → wrong slots

---

## Decisions

| Question | Decision |
|---|---|
| Sync latency | Minutes acceptable → polling (no webhooks) |
| GCal→Agendra scope | Import all events, visually differentiated |
| Recurring events | Expand to instances, 6-month window max |
| UI | Use existing `/agenda` page |
| Cron mechanism | Supabase pg_cron (no Vercel Pro required) |
| Sync frequency | 30 min cron + on-demand when opening /agenda |

---

## Architecture

```
Agendra (events table)
    ↑ import (GCal→Agendra, polling)
    ↓ create/update/delete (Agendra→GCal)
Google Calendar API (primary calendar only)
```

### Sync directions

**Agendra → GCal** (real-time, on user action):
- Create event (manual or AI) → `createGoogleCalendarEvent` → save `gcal_event_id`
- Delete event → `deleteGCalEvent` if `gcal_event_id` set
- Update event → `updateGCalEvent` if `gcal_event_id` set (future)

**GCal → Agendra** (polling):
- Every 30 min via Supabase pg_cron calling `POST /api/cron/gcal-sync`
- On `/agenda` page load if `last_synced_at` > 5 min → inline sync before render
- Manual "Sincronizar agora" button → `GET /api/sync/gcal` → router.refresh()

---

## Database Changes (schema_v5_gcal_sync.sql)

```sql
-- Allow external events without a lead
ALTER TABLE public.events ALTER COLUMN lead_id DROP NOT NULL;

-- Track event origin
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agendra'
  CHECK (source IN ('agendra', 'gcal'));

-- Track GCal sync status for Agendra-origin events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT DEFAULT NULL
  CHECK (gcal_sync_status IN ('synced', 'pending', 'error'));

-- Incremental sync token per company (avoids full sync every time)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS gcal_sync_token TEXT;

-- Timestamp for on-demand sync trigger
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Index for efficient gcal_event_id lookups during sync
CREATE INDEX IF NOT EXISTS events_gcal_event_id_idx
  ON public.events(gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;

-- Index for source filtering
CREATE INDEX IF NOT EXISTS events_source_idx
  ON public.events(source);
```

---

## File Map

| File | Type | Change |
|---|---|---|
| `supabase/schema_v5_gcal_sync.sql` | New | Migration |
| `lib/calendar/google.ts` | Modify | Add list/delete/update + timezone fix |
| `lib/calendar/sync.ts` | New | Core sync engine |
| `app/api/sync/gcal/route.ts` | New | On-demand sync endpoint |
| `app/api/cron/gcal-sync/route.ts` | New | Cron endpoint |
| `app/(app)/agenda/actions.ts` | Modify | GCal propagation on create/delete |
| `app/(app)/agenda/agenda-client.tsx` | Modify | Source badges + sync button |
| `app/(app)/agenda/page.tsx` | Modify | On-demand sync + pass GCal state |
| `lib/ai/tools.ts` | Modify | Timezone fix in checkAvailability |
| `lib/types/database.ts` | Modify | Add source + gcal_sync_status to Event |

---

## lib/calendar/google.ts — New Functions

### `listGCalEvents`
```typescript
listGCalEvents(
  refreshToken: string,
  calendarId: string,
  opts: {
    syncToken?: string;   // for incremental sync
    timeMin?: string;     // for full sync
    timeMax?: string;     // for full sync
  }
): Promise<{ events: GCalEvent[]; nextSyncToken: string }>
```

Filters applied server-side (via API params) and client-side:
- `singleEvents: true` — expands recurring into instances
- `timeMin/timeMax` — 6 month window on full sync
- `eventTypes: ['default']` — excludes fromGmail, outOfOffice, focusTime
- **Client-side filter after fetch:**
  - Skip events where `start.date` exists (all-day = holidays, birthdays)
  - Skip events where `transparency === 'transparent'` (shows as "free")
  - Skip events where `status === 'cancelled'` during listing (handled separately via syncToken delta)

### `deleteGCalEvent`
```typescript
deleteGCalEvent(refreshToken: string, calendarId: string, eventId: string): Promise<void>
```

### `updateGCalEvent`
```typescript
updateGCalEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput
): Promise<void>
```

### Fix: `createGoogleCalendarEvent`
Add `timeZone` to dateTime objects:
```typescript
start: { dateTime: event.start, timeZone: event.timeZone ?? 'America/Sao_Paulo' },
end:   { dateTime: event.end,   timeZone: event.timeZone ?? 'America/Sao_Paulo' },
```

---

## lib/calendar/sync.ts — Core Sync Engine

```typescript
export async function syncCompanyCalendar(companyId: string): Promise<SyncResult>
```

### Algorithm

```
1. Fetch company: google_refresh_token, google_calendar_id, gcal_sync_token
2. If no refresh_token → return { skipped: true }
3. isFullSync = !gcal_sync_token
4. Call listGCalEvents:
   - full sync: timeMin = now() - 7 days, timeMax = now() + 6 months (both relative to sync execution time)
   - incremental: syncToken only (fetches all changes since last sync)
5. For each GCal event in response:
   a. status === 'cancelled':
      → DELETE from events WHERE gcal_event_id = event.id AND source = 'gcal'
      → (Agendra-origin events are NOT deleted — user manages them)
   b. EXISTS in events (gcal_event_id match):
      → UPDATE title, start_time, end_time (if changed)
   c. NOT EXISTS + not all-day + not transparent:
      → INSERT with source='gcal', lead_id=null, gcal_event_id=event.id
6. Save nextSyncToken to companies.gcal_sync_token
7. Save now() to companies.last_synced_at
8. Return { inserted, updated, deleted, syncToken }
```

### Recurring events safety
- `singleEvents: true` in API call → Google expands recurring into instances
- `timeMax = 6 months` cap → limits expansion automatically
- No RRULE parsing needed

### syncToken invalidation
- Google returns 410 Gone when syncToken expired
- On 410: clear gcal_sync_token in DB, retry as full sync

---

## API Routes

### GET /api/sync/gcal — On-demand
- Auth: Supabase session (user must be logged in)
- Gets companyId from session
- Calls `syncCompanyCalendar(companyId)`
- Returns `{ inserted, updated, deleted, lastSyncedAt }`

### POST /api/cron/gcal-sync — Cron
- Auth: `Authorization: Bearer <CRON_SECRET>` env var
- Fetches all companies with `google_refresh_token IS NOT NULL`
- Calls `syncCompanyCalendar` for each, sequential with error isolation
- One company failing doesn't stop others
- Returns summary

### Supabase pg_cron setup

**Prerequisites:** Enable `pg_cron` and `pg_net` extensions in Supabase Dashboard → Database → Extensions.

```sql
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
```

Required Supabase env vars:
- `app.settings.api_url` = production app URL
- `app.settings.cron_secret` = random secret matching `CRON_SECRET` env var in Next.js

---

## agenda/actions.ts Changes

### createEvent (updated)
```
1. Validate inputs (same as today)
2. INSERT into events (same)
3. If company has google_refresh_token:
   a. Call createGoogleCalendarEvent
   b. On success: UPDATE event SET gcal_event_id=id, gcal_sync_status='synced'
   c. On failure: UPDATE event SET gcal_sync_status='error' (don't throw)
4. revalidatePath('/agenda')
```

### deleteEvent (updated)
```
1. Validate + auth (same as today)
2. Fetch event to get gcal_event_id + source
3. If gcal_event_id set AND source='agendra':
   a. Fetch company google_refresh_token
   b. Call deleteGCalEvent (silent failure — don't block user)
4. DELETE from events
5. revalidatePath('/agenda')
```

---

## agenda/page.tsx Changes

```typescript
// After getting companyId, fetch company GCal state
const { data: company } = await supabase
  .from('companies')
  .select('google_refresh_token, google_calendar_id, google_calendar_email, last_synced_at')
  .eq('id', companyId)
  .single();

// On-demand sync: if > 5 min since last sync (or never synced)
// Wrapped in timeout — if GCal API takes > 8s, skip and render with stale data
const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
if (company?.google_refresh_token && 
    (!company.last_synced_at || new Date(company.last_synced_at) < fiveMinAgo)) {
  await Promise.race([
    syncCompanyCalendar(companyId),
    new Promise((_, reject) => setTimeout(() => reject(new Error('sync timeout')), 8000)),
  ]).catch(() => { /* render with stale data, cron will catch up */ });
}

// Pass GCal state to client
return <AgendaClient 
  events={events ?? []} 
  leads={leads ?? []}
  companyId={companyId}
  gcalConnected={!!company?.google_refresh_token}
  gcalEmail={company?.google_calendar_email ?? null}
  lastSyncedAt={company?.last_synced_at ?? null}
/>;
```

---

## agenda-client.tsx UI Changes

### AgendaEvent interface additions
```typescript
interface AgendaEvent {
  // existing fields...
  source: 'agendra' | 'gcal';
  gcal_event_id: string | null;
  gcal_sync_status: 'synced' | 'pending' | 'error' | null;
}
```

### New props
```typescript
gcalConnected: boolean
gcalEmail: string | null
lastSyncedAt: string | null
```

### Visual indicators
- **GCal-origin events** (`source='gcal'`): blue Google Calendar badge, slightly different background, no delete button (read-only from Agendra's perspective, managed in GCal)
- **Agendra events with sync error** (`gcal_sync_status='error'`): amber "Sync pendente" badge
- **Agendra events synced** (`gcal_sync_status='synced'`): subtle GCal icon (no badge, clean)

### Header additions
```
[Hoje] [Novo agendamento]  ←existing→     [↻ Sincronizar · Há X min]  ←new→
```
- "Sincronizar" button: calls `GET /api/sync/gcal`, then `router.refresh()`
- Shows "Sincronizando..." spinner while pending
- Only visible if `gcalConnected`

---

## lib/ai/tools.ts — Timezone Fix

### handleCheckAvailability
Working hours comparison must use local time, not UTC:

```typescript
// Convert UTC cursor to local date parts using company timezone
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).formatToParts(cursor);
// Use local hour/minute for working hours comparison
```

---

## Event Filtering Rules (GCal import)

| Condition | Action |
|---|---|
| `start.date` exists (no `dateTime`) | Skip — all-day event (holiday, birthday) |
| `transparency === 'transparent'` | Skip — shows as free, doesn't block slots |
| `eventType !== 'default'` | Skip — Gmail events, OOO, focus time |
| `status === 'cancelled'` | Delete from Agendra if `source='gcal'` |
| `summary` empty/null | Import with title "Evento sem título" |
| All-day recurring | Skipped by all-day filter above |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| GCal API down during createEvent | Save event locally, `gcal_sync_status='error'` |
| GCal API down during deleteEvent | Delete locally, log warning |
| syncToken expired (410) | Clear token, retry as full sync |
| Refresh token revoked | Clear all GCal fields from company, show reconnect prompt |
| Rate limit (429) | Retry with exponential backoff (max 3 attempts) |
| Company sync fails in cron | Log + continue to next company |

---

## Environment Variables Required

```bash
# Existing
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourapp.com/api/auth/google

# New
CRON_SECRET=<random-256-bit-secret>
```

---

## Out of Scope

- Multiple Google Calendars per company (only `google_calendar_id`, default `primary`)
- Google Calendar webhook/push notifications (polling is sufficient)
- Conflict resolution when same event edited on both sides (last-write-wins via GCal as source of truth for gcal-origin events)
- Event update propagation from Agendra manual edit UI (delete + re-create workaround for now)
- Other calendar providers (Apple, Outlook)
