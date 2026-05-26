import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCompanyCalendar } from '@/lib/calendar/sync';

export const maxDuration = 120; // 120 seconds maximum duration

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

  // Fetch all companies with Google Calendar configured
  const { data: companies, error } = await admin
    .from('companies')
    .select('id, name')
    .not('google_refresh_token', 'is', null);

  if (error) {
    console.error('[GCal Background Sync] Failed to fetch companies:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, results: [] });
  }

  console.log(`[GCal Background Sync] Starting sync for ${companies.length} companies...`);

  // Run calendar syncs concurrently and resiliently
  const syncPromises = companies.map(async (company) => {
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
    } catch (err: any) {
      console.error(`[GCal Background Sync] Failed for company ${company.name} (${company.id}):`, err.message);
      return {
        companyId: company.id,
        name: company.name,
        success: false,
        error: err.message,
      };
    }
  });

  const results = await Promise.allSettled(syncPromises);

  const formattedResults = results.map((r) => {
    if (r.status === 'fulfilled') return r.value;
    return { success: false, error: String(r.reason) };
  });

  const totalSynced = formattedResults.filter((r: any) => r.success && !r.skipped).length;
  const totalFailed = formattedResults.filter((r: any) => !r.success).length;

  console.log(`[GCal Background Sync] Finished: ${totalSynced} synced, ${totalFailed} failed.`);

  return NextResponse.json({
    ok: true,
    companies_count: companies.length,
    synced: totalSynced,
    failed: totalFailed,
    results: formattedResults,
  });
}
