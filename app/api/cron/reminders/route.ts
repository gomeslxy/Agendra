/**
 * /api/cron/reminders — Dedicated reminder processor (5-min pg_cron)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/billing/active-statuses';
import { processCompanyReminders } from '@/lib/notifications/reminders';
import { verifyBearerSecret } from '@/lib/security/crypto-compare';
import { mapWithConcurrency } from '@/lib/infra/concurrency';
import { logError, logInfo } from '@/lib/logging';

export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;
const LIMIT_PER_COMPANY = 10;
const EXPIRY_WINDOW_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const expiryThreshold = new Date(Date.now() - EXPIRY_WINDOW_MS).toISOString();

  const { data: companies, error: companiesErr } = await admin
    .from('companies')
    .select(
      'id, name, persona_config, reminders_quiet_hours_enabled, reminders_quiet_hours_start, reminders_quiet_hours_end',
    )
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
    .not('subscription_status', 'eq', 'canceled');

  if (companiesErr) {
    logError('[cron/reminders] Failed to fetch companies:', companiesErr.message);
    return NextResponse.json({ error: companiesErr.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;
  let rescheduled = 0;

  const { abortedByDeadline } = await mapWithConcurrency(
    companies ?? [],
    5,
    async (company) => {
      const r = await processCompanyReminders(admin, company, now, expiryThreshold, LIMIT_PER_COMPANY);
      sent += r.sent;
      failed += r.failed;
      expired += r.expired;
      skipped += r.skipped;
      rescheduled += r.rescheduled;
    },
    { deadlineMs: startedAt + TIME_BUDGET_MS },
  );

  if (abortedByDeadline) {
    logInfo('[cron/reminders] Time budget reached — remaining companies deferred to next run');
  }

  const elapsed_ms = Date.now() - startedAt;
  logInfo(
    `[cron/reminders] Done — sent:${sent} failed:${failed} expired:${expired} rescheduled:${rescheduled} skipped:${skipped} elapsed:${elapsed_ms}ms`,
  );

  return NextResponse.json({ ok: true, sent, failed, expired, rescheduled, skipped, elapsed_ms });
}
