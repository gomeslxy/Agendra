/**
 * /api/cron/nightly — Vercel Free Tier unified cron (runs once daily at 20:00 BRT)
 *
 * Executes:
 *   1. Auto Follow-up — re-engages leads silent for 24h+ (max 10 per run)
 *   2. Reminders (evening) — catches any reminders missed by morning run
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { triggerAutoFollowUp } from '@/lib/ai/engine';
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

  // ── 1. Auto Follow-up ────────────────────────────────────────────────────────
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: leads, error } = await admin
      .from('leads')
      .select('id')
      .eq('is_paused', false)
      .not('status', 'in', '("success","disqualified")')
      .lt('updated_at', twentyFourHoursAgo)
      .or(`last_followup_at.is.null,last_followup_at.lt.${fortyEightHoursAgo}`)
      .limit(10);

    if (error) throw error;

    let sent = 0;
    let failed = 0;
    for (const lead of leads ?? []) {
      try {
        await triggerAutoFollowUp(lead.id);
        sent++;
      } catch {
        failed++;
      }
    }
    summary.followup = { sent, failed };
    console.log('[nightly-cron] followup:', summary.followup);
  } catch (err: any) {
    summary.followup = { error: err.message };
    console.error('[nightly-cron] followup failed:', err.message);
  }

  // ── 2. Reminders (evening sweep) ─────────────────────────────────────────────
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
        // Atomic claim — skip if /api/cron/reminders (5min job) already sent this
        const { data: claimed } = await admin
          .from('reminders')
          .update({ status: 'sent' })
          .eq('id', rem.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();

        if (!claimed) continue;

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
        sent++;
      } catch (err: any) {
        await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
        failed++;
      }
    }
    summary.reminders_evening = { sent, failed };
    console.log('[nightly-cron] reminders_evening:', summary.reminders_evening);
  } catch (err: any) {
    summary.reminders_evening = { error: err.message };
    console.error('[nightly-cron] reminders_evening failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
