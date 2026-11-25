/**
 * /api/cron/followup — Vercel Free Tier hourly/continual cron
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerAutoFollowUp } from '@/lib/ai/engine';
import { getPlanLimits } from '@/lib/billing/plans';
import { getCompanyUsage } from '@/lib/billing/limits';
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
    .select('id, name, plan_type, subscription_status, persona_config')
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    logError('[followup-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const companiesList = activeCompanies ?? [];
  logInfo(`[followup-cron] Processing ${companiesList.length} active companies`);

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
          .eq('followup_in_progress', false)
          .not('status', 'in', '("success","disqualified")')
          .lt('updated_at', delayAgo)
          .or(`last_followup_at.is.null,last_followup_at.lt.${intervalAgo}`)
          .limit(10);

        if (leadsErr) {
          logError(`[followup-cron] followup search error for company ${company.id}:`, leadsErr.message);
          return;
        }

        if (!leads || leads.length === 0) return;

        let usage;
        try {
          usage = await getCompanyUsage(company.id);
        } catch (usageErr: unknown) {
          const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
          logError(`[followup-cron] followup usage error for company ${company.id}:`, msg);
          return;
        }

        for (const lead of leads) {
          try {
            await triggerAutoFollowUp(lead.id, usage);
            results.push({ id: lead.id, company_id: company.id, status: 'success' });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ id: lead.id, company_id: company.id, status: 'error', error: msg });
          }
        }
      },
      { deadlineMs: startedAt + 240_000 },
    );

    summary.followup = { processed: results.length, details: results };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.followup = { error: msg };
    logError('[followup-cron] followup failed:', msg);
  }

  return NextResponse.json({ ok: true, ...summary });
}
