/**
 * GET /api/sync/gcal
 *
 * Triggers an immediate GCal sync for the authenticated user's company.
 * Called by the "Sincronizar agora" button in /agenda.
 */
import { NextResponse } from 'next/server';
import { syncCompanyCalendar } from '@/lib/calendar/sync';
import { invalidateGCalFreeBusyCache } from '@/lib/calendar/google';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { logError } from '@/lib/logging';

export async function GET(): Promise<NextResponse> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncCompanyCalendar(ctx.companyId);
    await invalidateGCalFreeBusyCache(ctx.companyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[Sync/GCal] On-demand sync failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
