/**
 * /api/cron/morning — Vercel unified morning cron (08:00 BRT)
 *
 * Stages:
 *   1. GCal Sync      — syncs Google Calendar for connected companies
 *   2. Auto Follow-up — re-engages silent leads (max 10 per company)
 *   3. Reminders      — sends reminders for appointments due today
 *   4. Channel Health — validates WhatsApp & Instagram tokens separately (fixes P0-SEC-06)
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
import { verifyBearerSecret } from '@/lib/security/crypto-compare';
import { mapWithConcurrency } from '@/lib/infra/concurrency';
import { logError, logInfo } from '@/lib/logging';

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const summary: Record<string, unknown> = {};

  const { data: activeCompanies, error: companiesError } = await admin
    .from('companies')
    .select(
      'id, name, plan_type, subscription_status, google_refresh_token, google_refresh_token_secret_id, persona_config, reminders_quiet_hours_enabled, reminders_quiet_hours_start, reminders_quiet_hours_end',
    )
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    logError('[morning-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const companiesList = activeCompanies ?? [];
  logInfo(`[morning-cron] Processing ${companiesList.length} active companies`);

  // ── 1. GCal Sync ────────────────────────────────────────────────────────────
  try {
    const gcal = { synced: 0, skipped: 0, errors: 0 };
    await mapWithConcurrency(
      companiesList,
      5,
      async (co) => {
        if (!co.google_refresh_token && !co.google_refresh_token_secret_id) {
          gcal.skipped++;
          return;
        }
        try {
          const r = await syncCompanyCalendar(co.id);
          if (r.skipped) gcal.skipped++;
          else gcal.synced++;
        } catch (err: unknown) {
          gcal.errors++;
          const errMsg = err instanceof Error ? err.message : String(err);
          logError(`[morning-cron] GCal sync error for company ${co.id} (${co.name}):`, errMsg);

          if (
            errMsg.includes('invalid_grant') ||
            errMsg.includes('renovar token') ||
            errMsg.includes('OAuth')
          ) {
            try {
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
            } catch (notifErr: unknown) {
              const nMsg = notifErr instanceof Error ? notifErr.message : String(notifErr);
              logError('[morning-cron] Failed to dispatch GCal error notification:', nMsg);
            }
          }
        }
      },
      { deadlineMs: startedAt + 90_000 },
    );
    summary.gcal_sync = gcal;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.gcal_sync = { error: msg };
    logError('[morning-cron] gcal_sync failed:', msg);
  }

  // ── 2. Auto Follow-up ─────────────────────────────────────────────────────────
  try {
    const results: { id: string; company_id: string; status: string; error?: string }[] = [];
    await mapWithConcurrency(
      companiesList,
      5,
      async (company) => {
        if (!getPlanLimits(company.plan_type).hasFollowUp) return;

        const persona = (company.persona_config ?? {}) as { followup_delay_hours?: number };
        const delayHours = persona.followup_delay_hours ?? 24;
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
          logError(`[morning-cron] followup search error for ${company.id}:`, leadsErr.message);
          return;
        }

        let usage;
        try {
          usage = await getCompanyUsage(company.id);
        } catch (usageErr: unknown) {
          const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
          logError(`[morning-cron] followup usage error for ${company.id}:`, msg);
          return;
        }

        for (const lead of leads ?? []) {
          try {
            await triggerAutoFollowUp(lead.id, usage);
            results.push({ id: lead.id, company_id: company.id, status: 'success' });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ id: lead.id, company_id: company.id, status: 'error', error: msg });
          }
        }
      },
      { deadlineMs: startedAt + 170_000 },
    );
    summary.followup = { processed: results.length, details: results };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.followup = { error: msg };
    logError('[morning-cron] followup failed:', msg);
  }

  // ── 3. Reminders ──────────────────────────────────────────────────────────────
  try {
    const now = new Date().toISOString();
    const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let sent = 0;
    let failed = 0;
    let expired = 0;
    let rescheduled = 0;

    await mapWithConcurrency(
      companiesList,
      5,
      async (company) => {
        const r = await processCompanyReminders(admin, company, now, expiryThreshold, 10);
        sent += r.sent;
        failed += r.failed;
        expired += r.expired;
        rescheduled += r.rescheduled;
      },
      { deadlineMs: startedAt + 210_000 },
    );
    summary.reminders = { sent, failed, expired, rescheduled };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.reminders = { error: msg };
    logError('[morning-cron] reminders failed:', msg);
  }

  // ── 4. Channel Health (provider-aware: WhatsApp vs Instagram) ─────────────────
  try {
    const { data: errorChannels } = await admin
      .from('channels')
      .select('id, company_id, provider, provider_id, status, last_error')
      .eq('status', 'error');

    const { data: activeChannels } = await admin
      .from('channels')
      .select('id, company_id, provider, provider_id, status, last_error')
      .eq('status', 'active')
      .order('last_seen_at', { ascending: true })
      .limit(5);

    const channelsToCheck = [...(errorChannels ?? []), ...(activeChannels ?? [])];

    let healthy = 0;
    let broken = 0;
    await mapWithConcurrency(
      channelsToCheck,
      5,
      async (ch) => {
        const { data: tokenData } = await admin.rpc('channel_get_access_token', {
          p_channel_id: ch.id,
        });
        const token = tokenData as string | null;

        if (!token) {
          logInfo(`[morning-cron] Access token missing for channel ${ch.id}`);
          return;
        }

        let isHealthy = false;
        if (ch.provider === 'instagram') {
          try {
            const pageRes = await fetch('https://graph.facebook.com/v19.0/me', {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(8_000),
            });
            isHealthy = pageRes.ok;
          } catch {
            isHealthy = false;
          }
        } else {
          const validation = await validateWhatsAppToken(ch.provider_id, token);
          isHealthy = validation.ok;
        }

        if (!isHealthy) {
          await admin
            .from('channels')
            .update({ status: 'error', updated_at: new Date().toISOString() })
            .eq('id', ch.id);
          broken++;
        } else if (ch.status !== 'active') {
          await admin
            .from('channels')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', ch.id);
          healthy++;
        } else {
          healthy++;
        }
      },
      { deadlineMs: startedAt + 240_000 },
    );
    summary.channel_health = { healthy, broken, checked: channelsToCheck.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.channel_health = { error: msg };
    logError('[morning-cron] channel_health failed:', msg);
  }

  // ── 5. Flush Buffer ───────────────────────────────────────────────────────────
  try {
    summary.flush_buffer = await flushMessageBuffer(admin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.flush_buffer = { error: msg };
    logError('[morning-cron] flush_buffer failed:', msg);
  }

  return NextResponse.json({ ok: true, ...summary });
}
