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
    const { getCompanyUsage } = await import('@/lib/billing/limits');
    const usage = await getCompanyUsage(membership.company_id);
    
    // In a real OAuth callback this would be checked before adding a new token.
    // Since this route just syncs an existing calendar, we just check the limit.
    if (usage.limits.maxCalendars <= 0) {
      return NextResponse.json({ error: 'Limite de calendários excedido para o seu plano.' }, { status: 403 });
    }

    const result = await syncCompanyCalendar(membership.company_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Sync/GCal] On-demand sync failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
