/**
 * /api/cron/reminders — Dedicated reminder processor (5-min pg_cron)
 *
 * Called by pg_cron `agendra_cron_reminders` every 5 minutes via pg_net.
 * Processes ONLY pending reminders — no GCal sync, no followup, no buffer flush.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/billing/active-statuses';
import { processCompanyReminders } from '@/lib/notifications/reminders';

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
  let rescheduled = 0;

  const { data: companies, error: companiesErr } = await admin
    .from('companies')
    .select('id, name, persona_config, reminders_quiet_hours_enabled, reminders_quiet_hours_start, reminders_quiet_hours_end')
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

    const r = await processCompanyReminders(admin, company, now, expiryThreshold, LIMIT_PER_COMPANY);
    sent += r.sent;
    failed += r.failed;
    expired += r.expired;
    skipped += r.skipped;
    rescheduled += r.rescheduled;
  }

  const elapsed_ms = Date.now() - startedAt;
  console.log(`[cron/reminders] Done — sent:${sent} failed:${failed} expired:${expired} rescheduled:${rescheduled} skipped:${skipped} elapsed:${elapsed_ms}ms`);

  return NextResponse.json({ ok: true, sent, failed, expired, rescheduled, skipped, elapsed_ms });
}
