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

    // Safety: skip if no dateTime (all-day already filtered but double-check)
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
      // Update only if something changed
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
        lead_id: null,
        title,
        start_time: startTime,
        end_time: endTime,
        gcal_event_id: gcalEvent.id,
        source: 'gcal',
        gcal_sync_status: null,
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
