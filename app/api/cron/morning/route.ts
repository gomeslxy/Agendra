/**
 * /api/cron/morning — Vercel Free Tier unified cron (runs once daily at 08:00 BRT)
 *
 * Executes in sequence:
 *   1. GCal Sync      — syncs Google Calendar for all connected companies
 *   2. Auto Follow-up — re-engages leads silent for 24h+ (max 10 per company)
 *   3. Reminders      — sends WhatsApp reminders for appointments due today
 *   4. Channel Health — validates WhatsApp tokens, marks broken channels
 *   5. Flush Buffer   — flushes pending SQL message buffers (safety fallback)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { syncCompanyCalendar } from '@/lib/calendar/sync';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';
import { triggerAutoFollowUp, handleIncomingMessage } from '@/lib/ai/engine';
import { getPlanLimits } from '@/lib/billing/plans';
import { getCompanyUsage } from '@/lib/billing/limits';

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

  // Fetch active companies (active or trial status) with all required plan/config context
  const { data: activeCompanies, error: companiesError } = await admin
    .from('companies')
    .select('id, name, plan_type, subscription_status, google_refresh_token, persona_config')
    .in('subscription_status', ['active', 'trial', 'trialing'])
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    console.error('[morning-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const companiesList = activeCompanies ?? [];
  console.log(`[morning-cron] Processing ${companiesList.length} active companies`);

  // ── 1. GCal Sync ────────────────────────────────────────────────────────────
  try {
    const gcal = { synced: 0, skipped: 0, errors: 0 };
    for (const co of companiesList) {
      if (!co.google_refresh_token) {
        gcal.skipped++;
        continue;
      }
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

  // ── 2. Auto Follow-up ─────────────────────────────────────────────────────────
  try {
    const results: { id: string; company_id: string; status: string; error?: string }[] = [];
    for (const company of companiesList) {
      if (!getPlanLimits(company.plan_type).hasFollowUp) continue;

      const delayHours = (company.persona_config as any)?.followup_delay_hours ?? 24;
      const intervalHours = delayHours * 2;
      const delayAgo = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();
      const intervalAgo = new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();

      const { data: leads, error: leadsErr } = await admin
        .from('leads')
        .select('id')
        .eq('company_id', company.id)
        .eq('is_paused', false)
        .not('status', 'in', '("success","disqualified")')
        .lt('updated_at', delayAgo)
        .or(`last_followup_at.is.null,last_followup_at.lt.${intervalAgo}`)
        .limit(10);

      if (leadsErr) {
        console.error(`[morning-cron] followup search error for company ${company.id}:`, leadsErr.message);
        continue;
      }

      // Preload usage once per company to avoid N+1 queries
      let usage;
      try {
        usage = await getCompanyUsage(company.id);
      } catch (usageErr: any) {
        console.error(`[morning-cron] followup usage error for company ${company.id}:`, usageErr.message);
        continue;
      }

      for (const lead of leads ?? []) {
        try {
          await triggerAutoFollowUp(lead.id, usage);
          results.push({ id: lead.id, company_id: company.id, status: 'success' });
        } catch (err: any) {
          results.push({ id: lead.id, company_id: company.id, status: 'error', error: err.message });
        }
      }
    }
    summary.followup = { processed: results.length, details: results };
    console.log('[morning-cron] followup:', summary.followup);
  } catch (err: any) {
    summary.followup = { error: err.message };
    console.error('[morning-cron] followup failed:', err.message);
  }

  // ── 3. Reminders ────────────────────────────────────────────────────────────
  try {
    const now = new Date().toISOString();
    let sent = 0;
    let failed = 0;

    for (const company of companiesList) {
      // Get reminders with an active event (not cancelled)
      const { data: reminders, error: remErr } = await admin
        .from('reminders')
        .select('*, leads (phone, name), events!inner (start_time, title, status)')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .lte('remind_at', now)
        .neq('events.status', 'cancelled')
        .limit(10);

      if (remErr) {
        console.error(`[morning-cron] reminders error for company ${company.id}:`, remErr.message);
        continue;
      }

      const tz = (company.persona_config as any)?.timezone ?? 'America/Sao_Paulo';

      for (const rem of reminders ?? []) {
        try {
          // Atomic claim
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

          const message = `Olá ${lead.name.split(' ')[0]}! Passando para lembrar do seu agendamento de "${event.title}" às ${timeStr}. Nos vemos em breve! 🗓`;

          await sendWhatsAppMessage(lead.phone, message, rem.company_id);

          // Log message history to lead
          await admin.from('messages').insert({
            lead_id: rem.lead_id,
            company_id: rem.company_id,
            role: 'assistant',
            content: message,
            metadata: { type: 'reminder', event_id: rem.event_id },
          });

          // Insert into automation events feed
          await admin.from('automation_events').insert({
            company_id: rem.company_id,
            lead_id: rem.lead_id,
            type: 'reminder_sent',
            detail: `Lembrete enviado para ${lead.name.split(' ')[0]} — ${event.title}`,
            payload: { event_id: rem.event_id, remind_at: rem.remind_at },
          });

          sent++;
        } catch (err: any) {
          await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
          failed++;
        }
      }
    }
    summary.reminders = { sent, failed };
    console.log('[morning-cron] reminders:', summary.reminders);
  } catch (err: any) {
    summary.reminders = { error: err.message };
    console.error('[morning-cron] reminders failed:', err.message);
  }

  // ── 4. Channel Health ────────────────────────────────────────────────────────
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

  // ── 5. Flush Buffer ──────────────────────────────────────────────────────────
  try {
    const { data: rows } = await admin.from('message_buffer')
      .select('*').eq('flushed', false).lte('flush_after', new Date().toISOString())
      .order('created_at', { ascending: true }).limit(100);

    if (!rows?.length) {
      summary.flush_buffer = { flushed: 0 };
    } else {
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = `${r.company_id}:${r.lead_phone}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }

      let flushed = 0;
      for (const items of groups.values()) {
        try {
          const usage = await getCompanyUsage(items[0].company_id);
          const consolidated = items.map(i => i.body).join('\n');
          const mergedMetadata = items.reduce((acc, i) => ({ ...acc, ...(i.metadata ?? {}) }), {});

          await handleIncomingMessage(
            items[0].company_id, items[0].lead_phone,
            items[0].lead_name ?? '', consolidated,
            items[0].provider_message_id, usage,
            { ...mergedMetadata, debounce_batch_size: items.length, via_sql_fallback: true }
          );

          await admin.from('message_buffer').update({ flushed: true })
            .in('provider_message_id', items.map(i => i.provider_message_id));
          flushed += items.length;
        } catch (err: any) {
          console.error('[morning-cron] [flush-buffer] err:', err.message);
        }
      }
      summary.flush_buffer = { flushed };
      console.log('[morning-cron] flush_buffer:', summary.flush_buffer);
    }
  } catch (err: any) {
    summary.flush_buffer = { error: err.message };
    console.error('[morning-cron] flush_buffer failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
