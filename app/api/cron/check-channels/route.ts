import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotificationForUsers } from '@/lib/notifications/create';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = req.headers.get('authorization') ?? '';
  const query = new URL(req.url).searchParams.get('secret') ?? '';
  return header === `Bearer ${cronSecret}` || query === cronSecret;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch all channels
  const { data: channels, error: channelsError } = await admin
    .from('channels')
    .select('id, company_id, provider_id, status, access_token, last_error');

  if (channelsError) {
    console.error('[check-channels] Failed to fetch channels:', channelsError.message);
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }

  let markedError = 0;

  // Active validation step
  for (const ch of channels ?? []) {
    if (ch.status === 'active') {
      const validation = await validateWhatsAppToken(ch.provider_id, ch.access_token);
      if (!validation.ok) {
        await admin
          .from('channels')
          .update({
            status: 'error',
            last_error: validation.error || 'Token inválido ou expirado',
            updated_at: new Date().toISOString()
          })
          .eq('id', ch.id);
        ch.status = 'error'; // update local status for notification flow
        ch.last_error = validation.error || 'Token inválido ou expirado';
        markedError++;
      }
    }
  }

  const errorChannels = (channels ?? []).filter(ch => ch.status === 'error');
  let notified = 0;

  for (const channel of errorChannels) {
    // Get all members of this company to notify
    const { data: members } = await admin
      .from('memberships')
      .select('user_id')
      .eq('company_id', channel.company_id);

    if (!members?.length) continue;

    // Check if we already sent a channel_error notification in the last hour
    // to avoid spam on repeated cron runs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', channel.company_id)
      .eq('type', 'channel_error')
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) > 0) continue; // already notified recently

    await createNotificationForUsers(members, {
      company_id: channel.company_id,
      type: 'channel_error',
      title: 'Canal WhatsApp com erro ⚠️',
      body: channel.last_error
        ? `Erro no canal: ${String(channel.last_error).slice(0, 120)}`
        : 'Um canal do WhatsApp está desconectado. Reconecte nas configurações.',
      action_url: '/settings?tab=channels',
      priority: 'critical',
      metadata: { channel_id: channel.id, provider_id: channel.provider_id },
    });

    notified++;
  }

  return NextResponse.json({
    ok: true,
    checked: channels?.length ?? 0,
    marked_error: markedError,
    notified
  });
}
