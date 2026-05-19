/**
 * /api/cron/nightly — Vercel Free Tier unified cron (runs once daily at 20:00 BRT)
 *
 * Executes:
 *   1. Auto Follow-up — re-engages leads silent for 24h+ (max 10 per company per run)
 *   2. Reminders (evening) — catches any reminders missed by morning run (per company)
 *
 * Multi-tenant: all queries scoped by company_id — no cross-tenant data access.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { triggerAutoFollowUp } from '@/lib/ai/engine';
import { buildReminderMessage, formatDateTime } from '@/lib/whatsapp/messages';
import { getPlanLimits } from '@/lib/billing/plans';

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

  // Fetch all active companies once — both tasks iterate over this list
  const { data: companies, error: companiesError } = await admin
    .from('companies')
    .select('id, plan_type, subscription_status, persona_config, name')
    .in('subscription_status', ['active', 'trial'])
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    console.error('[nightly-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const activeCompanies = companies ?? [];
  console.log(`[nightly-cron] Processing ${activeCompanies.length} active companies`);

  // ── 1. Auto Follow-up ─────────────────────────────────────────────────────────
  // [FIX P1-5] Follow-up removido do nightly. Já roda hourly via pg_cron → /api/cron/followup.
  // Manter aqui causava disparo duplicado simultâneo às 23h UTC, com double-billing do Gemini
  // e corrida desnecessária na claim atômica de last_followup_at.
  summary.followup = { skipped: 'handled by pg_cron hourly job (/api/cron/followup)' };
  console.log('[nightly-cron] followup: delegado ao pg_cron hourly. Sem ação aqui.');


  // ── 2. Reminders (evening sweep) ─────────────────────────────────────────────
  try {
    const now = new Date().toISOString();

    let totalSent = 0;
    let totalFailed = 0;

    for (const company of activeCompanies) {
      const { data: reminders, error: remErr } = await admin
        .from('reminders')
        .select('*, leads(phone, name), events(start_time, title)')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .lte('remind_at', now)
        .limit(10);

      if (remErr) {
        console.error(`[nightly-cron] reminders error for company ${company.id}:`, remErr.message);
        continue;
      }

      const tz = (company.persona_config as any)?.timezone ?? 'America/Sao_Paulo';
      const businessName = company.name ?? 'nossa empresa';

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
          totalSent++;
        } catch (err: any) {
          await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
          totalFailed++;
        }
      }
    }

    summary.reminders_evening = { sent: totalSent, failed: totalFailed };
    console.log('[nightly-cron] reminders_evening:', summary.reminders_evening);
  } catch (err: any) {
    summary.reminders_evening = { error: err.message };
    console.error('[nightly-cron] reminders_evening failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
