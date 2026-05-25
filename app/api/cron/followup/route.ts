/**
 * /api/cron/followup — Vercel Free Tier hourly/continual cron
 *
 * Runs Auto Follow-up to re-engage leads silent for followup_delay_hours (max 10 per company)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerAutoFollowUp } from '@/lib/ai/engine';
import { getPlanLimits } from '@/lib/billing/plans';
import { getCompanyUsage } from '@/lib/billing/limits';
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

  // Fetch active companies (active or trial status) with required plan/config context
  const { data: activeCompanies, error: companiesError } = await admin
    .from('companies')
    .select('id, name, plan_type, subscription_status, persona_config')
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    console.error('[followup-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const companiesList = activeCompanies ?? [];
  console.log(`[followup-cron] Processing ${companiesList.length} active companies`);

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
        .eq('followup_in_progress', false) // Safe guard
        .not('status', 'in', '("success","disqualified")')
        .lt('updated_at', delayAgo)
        .or(`last_followup_at.is.null,last_followup_at.lt.${intervalAgo}`)
        .limit(10);

      if (leadsErr) {
        console.error(`[followup-cron] followup search error for company ${company.id}:`, leadsErr.message);
        continue;
      }

      if (!leads || leads.length === 0) continue;

      // Preload usage once per company to avoid N+1 queries
      let usage;
      try {
        usage = await getCompanyUsage(company.id);
      } catch (usageErr: any) {
        console.error(`[followup-cron] followup usage error for company ${company.id}:`, usageErr.message);
        continue;
      }

      for (const lead of leads) {
        try {
          await triggerAutoFollowUp(lead.id, usage);
          results.push({ id: lead.id, company_id: company.id, status: 'success' });
        } catch (err: any) {
          results.push({ id: lead.id, company_id: company.id, status: 'error', error: err.message });
        }
      }
    }
    summary.followup = { processed: results.length, details: results };
    console.log('[followup-cron] followup:', summary.followup);
  } catch (err: any) {
    summary.followup = { error: err.message };
    console.error('[followup-cron] followup failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
