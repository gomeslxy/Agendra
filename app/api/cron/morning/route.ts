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
import { processCompanyReminders } from '@/lib/notifications/reminders';
import { syncCompanyCalendar } from '@/lib/calendar/sync';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';
import { triggerAutoFollowUp } from '@/lib/ai/engine';
import { getPlanLimits } from '@/lib/billing/plans';
import { getCompanyUsage } from '@/lib/billing/limits';
import { flushMessageBuffer } from '@/lib/ai/buffer-flush';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/billing/active-statuses';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${cronSecret}`;
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
    .select('id, name, plan_type, subscription_status, google_refresh_token, persona_config, reminders_quiet_hours_enabled, reminders_quiet_hours_start, reminders_quiet_hours_end')
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
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
      } catch (err: any) {
        gcal.errors++;
        console.error(`[morning-cron] GCal sync error for company ${co.id} (${co.name}):`, err?.message);
        
        // GCal Fallback: alert admins when refresh token expires or is revoked (invalid_grant)
        const errMsg = err?.message ?? '';
        if (errMsg.includes('invalid_grant') || errMsg.includes('renovar token') || errMsg.includes('OAuth')) {
          try {
            // Find company admin/owner users to notify
            const { data: admins } = await admin
              .from('memberships')
              .select('user_id')
              .eq('company_id', co.id)
              .in('role', ['admin', 'owner']);

            if (admins?.length) {
              const { createNotificationForUsers } = await import('@/lib/notifications/create');
              await createNotificationForUsers(admins, {
                company_id: co.id,
                type: 'channel_error',
                title: 'Calendário Google Desconectado ⚠️',
                body: `A integração do Google Calendar para a empresa ${co.name} expirou ou foi revogada. Por favor, acesse Configurações -> Canais para reconectar.`,
                action_url: '/settings?tab=channels',
                priority: 'high',
              });
            }
          } catch (notifErr: any) {
            console.error('[morning-cron] Failed to dispatch GCal error notification:', notifErr?.message);
          }
        }
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

  // ── 3. Reminders (fallback sweep — primary processing via /api/cron/reminders every 5min) ───────────────────────────────
  try {
    const now = new Date().toISOString();
    const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let sent = 0;
    let failed = 0;
    let expired = 0;
    let rescheduled = 0;

    for (const company of companiesList) {
      const r = await processCompanyReminders(admin, company, now, expiryThreshold, 10);
      sent += r.sent;
      failed += r.failed;
      expired += r.expired;
      rescheduled += r.rescheduled;
    }
    summary.reminders = { sent, failed, expired, rescheduled };
    console.log('[morning-cron] reminders:', summary.reminders);
  } catch (err: any) {
    summary.reminders = { error: err.message };
    console.error('[morning-cron] reminders failed:', err.message);
  }

  // ── 4. Channel Health ────────────────────────────────────────────────────────
  try {
    // Check ALL channels with status='error' + a sample of 'active' channels
    // to detect silently expired tokens before they cause message loss.
    const { data: errorChannels } = await admin
      .from('channels')
      .select('id, company_id, provider_id, status, last_error')
      .eq('status', 'error');

    const { data: activeChannels } = await admin
      .from('channels')
      .select('id, company_id, provider_id, status, last_error')
      .eq('status', 'active')
      .order('last_seen_at', { ascending: true }) // prioritize longest unseen
      .limit(5); // CRIT-7: validate sample of active channels too

    const channelsToCheck = [
      ...(errorChannels ?? []),
      ...(activeChannels ?? []),
    ];

    let healthy = 0;
    let broken = 0;
    for (const ch of channelsToCheck) {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: ch.id });
      const token = tokenData as string;

      if (!token) {
        console.warn(`[morning-cron] Access token missing for channel ${ch.id}`);
        continue;
      }

      const validation = await validateWhatsAppToken(ch.provider_id, token);
      if (!validation.ok) {
        await admin.from('channels').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', ch.id);
        broken++;
      } else if (ch.status !== 'active') {
        // Was 'error', now healed
        await admin.from('channels').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', ch.id);
        healthy++;
      } else {
        healthy++;
      }
    }
    summary.channel_health = { healthy, broken, checked: channelsToCheck.length };
    console.log('[morning-cron] channel_health:', summary.channel_health);
  } catch (err: any) {
    summary.channel_health = { error: err.message };
    console.error('[morning-cron] channel_health failed:', err.message);
  }

  // ── 5. Flush Buffer (safety sweep — primary drain is the 1-min /api/cron/flush-buffer) ──
  try {
    summary.flush_buffer = await flushMessageBuffer(admin);
    console.log('[morning-cron] flush_buffer:', summary.flush_buffer);
  } catch (err: any) {
    summary.flush_buffer = { error: err.message };
    console.error('[morning-cron] flush_buffer failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
