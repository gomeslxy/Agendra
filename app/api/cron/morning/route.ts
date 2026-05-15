/**
 * /api/cron/morning — Vercel Free Tier unified cron (runs once daily at 08:00 BRT)
 *
 * Executes in sequence:
 *   1. GCal Sync      — syncs Google Calendar for all connected companies
 *   2. Reminders      — sends WhatsApp reminders for appointments due today
 *   3. Channel Health — validates WhatsApp tokens, marks broken channels
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { syncCompanyCalendar } from '@/lib/calendar/sync';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';
import { buildReminderMessage, formatDateTime } from '@/lib/whatsapp/messages';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = req.headers.get('authorization') ?? '';
  const query = new URL(req.url).searchParams.get('secret') ?? '';
  return header === `Bearer ${cronSecret}` || query === cronSecret;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary: Record<string, any> = {};

  // ── 1. GCal Sync ────────────────────────────────────────────────────────────
  try {
    const { data: companies } = await admin
      .from('companies')
      .select('id')
      .not('google_refresh_token', 'is', null);

    const gcal = { synced: 0, skipped: 0, errors: 0 };
    for (const co of companies ?? []) {
      try {
        const r = await syncCompanyCalendar(co.id);
        r.skipped ? gcal.skipped++ : gcal.synced++;
      } catch {
        gcal.errors++;
      }
    }
    summary.gcal_sync = gcal;
    console.log('[morning-cron] gcal_sync:', gcal);
  } catch (err: any) {
    summary.gcal_sync = { error: err.message };
    console.error('[morning-cron] gcal_sync failed:', err.message);
  }

  // ── 2. Reminders ────────────────────────────────────────────────────────────
  try {
    const now = new Date().toISOString();
    const { data: reminders } = await admin
      .from('reminders')
      .select('*, leads(phone, name), events(start_time, title), companies(persona_config, name)')
      .eq('status', 'pending')
      .lte('remind_at', now)
      .limit(30);

    let sent = 0;
    let failed = 0;
    for (const rem of reminders ?? []) {
      try {
        const lead = rem.leads as any;
        const event = rem.events as any;
        if (!lead?.phone || !event?.start_time) throw new Error('Dados incompletos');

        const tz = (rem.companies as any)?.persona_config?.timezone ?? 'America/Sao_Paulo';
        const businessName = (rem.companies as any)?.name ?? 'nossa empresa';
        const eventDate = new Date(event.start_time);
        const hoursUntil = (eventDate.getTime() - Date.now()) / 3600000;
        const { dateStr, timeStr } = formatDateTime(eventDate, tz);
        const msg = buildReminderMessage({
          leadFirstName: lead.name.split(' ')[0],
          serviceName: event.title,
          dateStr,
          timeStr,
          businessName,
          hoursAhead: Math.round(hoursUntil),
        });
        await sendWhatsAppMessage(lead.phone, msg, rem.company_id);
        await admin.from('reminders').update({ status: 'sent' }).eq('id', rem.id);
        sent++;
      } catch (err: any) {
        await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
        failed++;
      }
    }
    summary.reminders = { sent, failed };
    console.log('[morning-cron] reminders:', summary.reminders);
  } catch (err: any) {
    summary.reminders = { error: err.message };
    console.error('[morning-cron] reminders failed:', err.message);
  }

  // ── 3. Channel Health ────────────────────────────────────────────────────────
  try {
    const { data: channels } = await admin
      .from('channels')
      .select('*')
      .eq('status', 'error');

    let healthy = 0;
    let broken = 0;
    for (const ch of channels ?? []) {
      const validation = await validateWhatsAppToken(ch.provider_id, ch.access_token);
      if (!validation.ok) {
        await admin.from('channels').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', ch.id);
        broken++;
      } else {
        await admin.from('channels').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', ch.id);
        healthy++;
      }
    }
    summary.channel_health = { healthy, broken };
    console.log('[morning-cron] channel_health:', summary.channel_health);
  } catch (err: any) {
    summary.channel_health = { error: err.message };
    console.error('[morning-cron] channel_health failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
