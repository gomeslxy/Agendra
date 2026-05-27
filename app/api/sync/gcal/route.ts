/**
 * GET /api/sync/gcal
 *
 * Triggers an immediate GCal sync for the authenticated user's company.
 * Called by the "Sincronizar agora" button in /agenda.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncCompanyCalendar } from '@/lib/calendar/sync';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (!membership?.company_id) {
    return NextResponse.json({ error: 'No company' }, { status: 400 });
  }

  try {
    // syncCompanyCalendar already short-circuits (returns { skipped: true })
    // if google_refresh_token is missing. No billing gate needed here since
    // the calendar was already connected (gated at OAuth time by billing/gate.ts).
    const result = await syncCompanyCalendar(membership.company_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Sync/GCal] On-demand sync failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
