import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotificationForUsers } from '@/lib/notifications/create';

export async function GET() {
  const admin = createAdminClient();

  // Find channels with error status
  const { data: errorChannels } = await admin
    .from('channels')
    .select('id, company_id, provider_id, status, last_error')
    .eq('status', 'error');

  if (!errorChannels?.length) {
    return NextResponse.json({ ok: true, checked: 0, errors: 0 });
  }

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
      title: 'Canal WhatsApp com erro',
      body: channel.last_error
        ? `Erro no canal: ${String(channel.last_error).slice(0, 120)}`
        : 'Um canal do WhatsApp está desconectado. Reconecte nas configurações.',
      action_url: '/settings',
      priority: 'critical',
      metadata: { channel_id: channel.id, provider_id: channel.provider_id },
    });

    notified++;
  }

  return NextResponse.json({ ok: true, checked: errorChannels.length, notified });
}
