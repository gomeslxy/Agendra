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
 * Agendra-origin events (source='agendra') keep gcal_event_id for cancel propagation.
 *
 * W1.6: Cancelled GCal events mark ALL matching rows as status='cancelled' (any source).
 * W2.14: Bulk-loads existing events in one query; batch inserts in groups of 100.
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
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isRevoked = errMsg.includes('invalid_grant') || errMsg.includes('invalid_client') || errMsg.includes('Token expirado') || errMsg.includes('400') || errMsg.includes('401');

    if (isRevoked) {
      console.warn(`[GCal Background Sync] 🚫 Credentials revoked/expired for companyId=${companyId}. Disconnecting integration.`);
      
      // 1. Clear credentials in DB to prevent further retries
      await admin
        .from('companies')
        .update({
          google_refresh_token: null,
          google_calendar_id: null,
          google_calendar_email: null,
          gcal_sync_token: null,
        })
        .eq('id', companyId);

      // 2. Alert the company owners and admins via high-priority in-app notification
      try {
        const { data: members } = await admin
          .from('memberships')
          .select('user_id')
          .eq('company_id', companyId)
          .in('role', ['owner', 'admin']);

        if (members && members.length > 0) {
          const { createNotificationForUsers } = await import('@/lib/notifications/create');
          await createNotificationForUsers(members, {
            company_id: companyId,
            type: 'channel_error',
            title: 'Agenda Google desconectada',
            body: `A conexão com seu Google Calendar foi revogada ou expirou. Por favor, reconecte nas configurações de agenda para continuar sincronizando seus horários.`,
            action_url: '/settings',
            priority: 'high',
          });
        }
      } catch (notifErr: any) {
        console.error('[GCal Background Sync] Failed to create revocation notification:', notifErr.message);
      }

      // Return a skipped sync result instead of crashing the cron
      return { skipped: true, inserted: 0, updated: 0, deleted: 0, syncToken: '' };
    }

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

  // ── Pass 1: Process cancelled events (W1.6) ───────────────────────────────
  // Mark cancelled events as status='cancelled' for ANY source — not just 'gcal'.
  // Prevents agendra-origin bookings from staying 'confirmed' after owner deletes in GCal.
  // Physical delete is avoided to preserve audit history and UI reporting.
  const cancelledGcalIds = gcalResult.events
    .filter(e => e.status === 'cancelled')
    .map(e => e.id);

  for (const gcalId of cancelledGcalIds) {
    const { error } = await admin
      .from('events')
      .update({ status: 'cancelled' })
      .eq('gcal_event_id', gcalId)
      .eq('company_id', companyId);
    if (!error) deleted++;
  }

  // ── Pass 2: Active events — bulk-load existing then batch insert (W2.14) ──
  const activeEvents = gcalResult.events.filter(
    e => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime
  );

  if (activeEvents.length > 0) {
    // Single query to load all existing rows by gcal_event_id (avoids N+1)
    const gcalEventIds = activeEvents.map(e => e.id);
    const { data: existingRows } = await admin
      .from('events')
      .select('id, gcal_event_id, title, start_time, end_time')
      .eq('company_id', companyId)
      .in('gcal_event_id', gcalEventIds);

    const existingMap = new Map<string, { id: string; title: string; start_time: string; end_time: string }>();
    for (const row of existingRows ?? []) {
      if (row.gcal_event_id) existingMap.set(row.gcal_event_id, row);
    }

    const toInsert: any[] = [];

    for (const gcalEvent of activeEvents) {
      const title = gcalEvent.summary?.trim() || 'Evento sem título';
      const startTime = gcalEvent.start.dateTime!;
      const endTime = gcalEvent.end.dateTime!;

      const existing = existingMap.get(gcalEvent.id);
      if (existing) {
        // Update only if something changed (title or times)
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
        // Queue for bulk insert
        toInsert.push({
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

    // Bulk insert in batches of 100 (W2.14)
    for (let i = 0; i < toInsert.length; i += 100) {
      await admin.from('events').insert(toInsert.slice(i, i + 100));
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
