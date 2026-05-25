import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotificationForUsers } from '@/lib/notifications/create';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';

export const maxDuration = 60;

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

  // Fetch all channels (M2 FIX: Exclude access_token from bulk query)
  const { data: channels, error: channelsError } = await admin
    .from('channels')
    .select('id, company_id, provider_id, provider, status, token_expires_at, last_error');

  if (channelsError) {
    console.error('[check-channels] Failed to fetch channels:', channelsError.message);
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }

  let markedError = 0;

  // Active validation step
  for (const ch of channels ?? []) {
    if (ch.status === 'active') {
      // M2 FIX: Decrypt and fetch access_token securely on demand using Vault RPC
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: ch.id });
      const token = tokenData as string;

      if (!token) {
        console.warn(`[check-channels] Access token missing for channel ${ch.id}`);
        continue;
      }

      if (ch.provider === 'instagram') {
        let tokenExpired = false;
        
        // Dynamic Instagram Token Refresh: if expiration is < 10 days, refresh it!
        if (ch.token_expires_at) {
          const expiresDate = new Date(ch.token_expires_at);
          const diffDays = (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          
          if (diffDays < 10) {
            console.log(`[check-channels] Instagram token for channel ${ch.id} expires in ${diffDays.toFixed(1)} days. Refreshing token...`);
            try {
              const { refreshInstagramLongLivedToken } = await import('@/lib/channels/adapters/instagram-auth');
              const refreshRes = await refreshInstagramLongLivedToken(ch.id, token);
              
              if (!refreshRes.success) {
                await admin
                  .from('channels')
                  .update({
                    status: 'error',
                    last_error: refreshRes.error || 'Falha ao atualizar token Instagram',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', ch.id);
                ch.status = 'error';
                ch.last_error = refreshRes.error || 'Falha ao atualizar token Instagram';
                markedError++;
                tokenExpired = true;
              }
            } catch (refErr: any) {
              console.error(`[check-channels] Failed to refresh Instagram token for channel ${ch.id}:`, refErr.message);
            }
          }
        }

        // If refresh did not fail, do standard validation check against Facebook Graph API
        if (!tokenExpired) {
          try {
            const pageRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
            if (!pageRes.ok) {
              const errData = await pageRes.json();
              throw new Error(errData?.error?.message || `HTTP ${pageRes.status}`);
            }
          } catch (valErr: any) {
            await admin
              .from('channels')
              .update({
                status: 'error',
                last_error: `Instagram validation failed: ${valErr.message}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', ch.id);
            ch.status = 'error';
            ch.last_error = `Instagram validation failed: ${valErr.message}`;
            markedError++;
          }
        }
      } else {
        // WhatsApp validation
        const validation = await validateWhatsAppToken(ch.provider_id, token);
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
