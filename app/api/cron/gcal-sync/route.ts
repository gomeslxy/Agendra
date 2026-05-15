/**
 * POST /api/cron/gcal-sync
 *
 * Called by Supabase pg_cron every 30 minutes.
 * Syncs GCal for ALL companies that have Google Calendar connected.
 * Protected by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCompanyCalendar } from '@/lib/calendar/sync';

async function handleGCalSync(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron/GCal] CRON_SECRET env var not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const authHeader = request.headers.get('Authorization');
  const querySecret = new URL(request.url).searchParams.get('secret') ?? '';
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: companies, error } = await admin
    .from('companies')
    .select('id')
    .not('google_refresh_token', 'is', null);

  if (error) {
    console.error('[Cron/GCal] Failed to fetch companies:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ ok: true, message: 'No companies with GCal connected', synced: 0 });
  }

  const summary = { synced: 0, skipped: 0, inserted: 0, updated: 0, deleted: 0, errors: 0 };

  for (const company of companies) {
    try {
      const result = await syncCompanyCalendar(company.id);
      if (result.skipped) {
        summary.skipped++;
      } else {
        summary.synced++;
        summary.inserted += result.inserted;
        summary.updated += result.updated;
        summary.deleted += result.deleted;
      }
    } catch (err) {
      summary.errors++;
      console.error(`[Cron/GCal] Sync failed for company ${company.id}:`, err);
    }
  }

  console.log('[Cron/GCal] Sync complete:', summary);
  return NextResponse.json({ ok: true, ...summary });
}

// Vercel Cron calls GET; keep POST for manual triggers
export const GET = handleGCalSync;
export const POST = handleGCalSync;
