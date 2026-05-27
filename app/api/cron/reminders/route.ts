/**
 * /api/cron/reminders — Dedicated reminder processor (5-min pg_cron)
 *
 * Called by pg_cron `agendra_cron_reminders` every 5 minutes via pg_net.
 * Processes ONLY pending reminders — no GCal sync, no followup, no buffer flush.
 *
 * Guarantees:
 *   - Atomic claim prevents double-send across concurrent executions
 *   - Expiry guard cancels reminders for events that already started (>30min ago)
 *   - 8s internal timeout guard (Vercel Hobby limit is 10s)
 *   - Returns full observability payload for pg_net response logs
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendChannelMessage } from '@/lib/channels/send';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/billing/active-statuses';

const TIMEOUT_MS = 8_000;
const LIMIT_PER_COMPANY = 10;
// Reminders for events that started more than this long ago are expired
const EXPIRY_WINDOW_MS = 30 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const expiryThreshold = new Date(Date.now() - EXPIRY_WINDOW_MS).toISOString();

  let sent = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;

  const { data: companies, error: companiesErr } = await admin
    .from('companies')
    .select('id, persona_config')
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
    .not('subscription_status', 'eq', 'canceled');

  if (companiesErr) {
    console.error('[cron/reminders] Failed to fetch companies:', companiesErr.message);
    return NextResponse.json({ error: companiesErr.message }, { status: 500 });
  }

  for (const company of companies ?? []) {
    // Abort remaining companies if approaching Vercel timeout
    if (Date.now() - startedAt > TIMEOUT_MS) {
      console.warn('[cron/reminders] Timeout guard hit — aborting remaining companies');
      break;
    }

    const { data: reminders, error: remErr } = await admin
      .from('reminders')
      .select('id, lead_id, event_id, company_id, remind_at, leads(phone, name), events!inner(start_time, title, status)')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .lte('remind_at', now)
      .neq('events.status', 'cancelled')
      .limit(LIMIT_PER_COMPANY);

    if (remErr) {
      console.error(`[cron/reminders] Query error for company ${company.id}:`, remErr.message);
      continue;
    }

    const tz = (company.persona_config as any)?.timezone ?? 'America/Sao_Paulo';

    for (const rem of reminders ?? []) {
      const event = rem.events as any;
      const lead = rem.leads as any;

      // Expiry guard: cancel if event already started more than EXPIRY_WINDOW_MS ago
      if (event?.start_time && new Date(event.start_time) < new Date(expiryThreshold)) {
        await admin
          .from('reminders')
          .update({ status: 'cancelled', error_log: 'Evento expirado', updated_at: new Date().toISOString() })
          .eq('id', rem.id)
          .eq('status', 'pending');
        expired++;
        console.warn(`[cron/reminders] Expired reminder ${rem.id} — event started at ${event.start_time}`);
        continue;
      }

      if (!lead?.phone || !event?.start_time) {
        skipped++;
        continue;
      }

      // Atomic claim: only one worker wins the status transition pending → sent
      const { data: claimed } = await admin
        .from('reminders')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', rem.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (!claimed) {
        // Another concurrent execution already claimed this reminder
        skipped++;
        continue;
      }

      try {
        const dateObj = new Date(event.start_time);
        const fmt = new Intl.DateTimeFormat('pt-BR', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        });
        const parts = fmt.formatToParts(dateObj);
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
        const timeStr = `${get('hour')}:${get('minute')} do dia ${get('day')}/${get('month')}`;

        const firstName = lead.name?.split(' ')[0] ?? lead.name ?? 'cliente';
        const message = `Olá ${firstName}! Passando para lembrar do seu agendamento de "${event.title}" às ${timeStr}. Nos vemos em breve! 🗓`;

        await sendChannelMessage(lead.phone, message, rem.company_id);

        // Log to message history
        await admin.from('messages').insert({
          lead_id: rem.lead_id,
          company_id: rem.company_id,
          role: 'assistant',
          content: message,
          metadata: { type: 'reminder', event_id: rem.event_id },
        });

        // Log to automation events feed
        await admin.from('automation_events').insert({
          company_id: rem.company_id,
          lead_id: rem.lead_id,
          type: 'reminder_sent',
          detail: `Lembrete enviado para ${firstName} — ${event.title}`,
          payload: { event_id: rem.event_id, remind_at: rem.remind_at },
        });

        sent++;
        console.log(`[cron/reminders] Sent reminder ${rem.id} → ${lead.phone} (event: ${event.title} at ${timeStr})`);
      } catch (err: any) {
        // Revert status to failed so manual recovery is possible
        await admin
          .from('reminders')
          .update({ status: 'failed', error_log: err.message, updated_at: new Date().toISOString() })
          .eq('id', rem.id);
        failed++;
        console.error(`[cron/reminders] Failed to send reminder ${rem.id}:`, err.message);
      }
    }
  }

  const elapsed_ms = Date.now() - startedAt;
  console.log(`[cron/reminders] Done — sent:${sent} failed:${failed} expired:${expired} skipped:${skipped} elapsed:${elapsed_ms}ms`);

  return NextResponse.json({ ok: true, sent, failed, expired, skipped, elapsed_ms });
}
