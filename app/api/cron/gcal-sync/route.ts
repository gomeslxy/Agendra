import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCompanyCalendar } from '@/lib/calendar/sync';
import { verifyBearerSecret } from '@/lib/security/crypto-compare';
import { mapWithConcurrency } from '@/lib/infra/concurrency';
import { logError, logInfo } from '@/lib/logging';

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();

  const { data: companies, error } = await admin
    .from('companies')
    .select('id, name')
    .or('google_refresh_token.not.is.null,google_refresh_token_secret_id.not.is.null');

  if (error) {
    logError('[GCal Background Sync] Failed to fetch companies:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, results: [] });
  }

  logInfo(`[GCal Background Sync] Starting sync for ${companies.length} companies...`);

  const { results, abortedByDeadline } = await mapWithConcurrency(
    companies,
    5,
    async (company) => {
      try {
        const result = await syncCompanyCalendar(company.id);
        return {
          companyId: company.id,
          name: company.name,
          success: true,
          skipped: !!result.skipped,
          inserted: result.inserted,
          updated: result.updated,
          deleted: result.deleted,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`[GCal Background Sync] Failed for company ${company.name} (${company.id}):`, msg);
        return {
          companyId: company.id,
          name: company.name,
          success: false,
          skipped: false,
          error: msg,
        };
      }
    },
    { deadlineMs: startedAt + 240_000 },
  );

  const formattedResults = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { success: false, skipped: false, error: String(r.reason) },
  );

  const totalSynced = formattedResults.filter((r) => r.success && !r.skipped).length;
  const totalFailed = formattedResults.filter((r) => !r.success).length;

  return NextResponse.json({
    ok: true,
    companies_count: companies.length,
    synced: totalSynced,
    failed: totalFailed,
    abortedByDeadline,
    results: formattedResults,
  });
}
