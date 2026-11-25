import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotificationForUsers } from '@/lib/notifications/create';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';
import { verifyBearerSecret } from '@/lib/security/crypto-compare';
import { mapWithConcurrency } from '@/lib/infra/concurrency';
import { logError, logInfo } from '@/lib/logging';

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data: channels, error: channelsError } = await admin
    .from('channels')
    .select('id, company_id, provider_id, provider, status, token_expires_at, last_error');

  if (channelsError) {
    logError('[check-channels] Failed to fetch channels:', channelsError.message);
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }

  let markedError = 0;
  const activeChannels = (channels ?? []).filter((ch) => ch.status === 'active');

  await mapWithConcurrency(
    activeChannels,
    5,
    async (ch) => {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', {
        p_channel_id: ch.id,
      });
      const token = tokenData as string | null;

      if (!token) {
        logInfo(`[check-channels] Access token missing for channel ${ch.id}`);
        return;
      }

      if (ch.provider === 'instagram') {
        let tokenExpired = false;

        if (ch.token_expires_at) {
          const expiresDate = new Date(ch.token_expires_at);
          const diffDays = (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

          if (diffDays < 10) {
            logInfo(
              `[check-channels] Instagram token for channel ${ch.id} expires in ${diffDays.toFixed(1)} days. Refreshing...`,
            );
            try {
              const { refreshInstagramLongLivedToken } = await import(
                '@/lib/channels/adapters/instagram-auth'
              );
              const refreshRes = await refreshInstagramLongLivedToken(ch.id, token);

              if (!refreshRes.success) {
                const errMsg = refreshRes.error || 'Falha ao atualizar token Instagram';
                await admin
                  .from('channels')
                  .update({
                    status: 'error',
                    last_error: errMsg,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', ch.id);
                ch.status = 'error';
                ch.last_error = errMsg;
                markedError++;
                tokenExpired = true;
              }
            } catch (refErr: unknown) {
              const msg = refErr instanceof Error ? refErr.message : String(refErr);
              logError(`[check-channels] Failed to refresh Instagram token for ${ch.id}:`, msg);
            }
          }
        }

        if (!tokenExpired) {
          try {
            const pageRes = await fetch('https://graph.facebook.com/v19.0/me', {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(8_000),
            });
            if (!pageRes.ok) {
              const errData = (await pageRes.json()) as { error?: { message?: string } };
              throw new Error(errData?.error?.message || `HTTP ${pageRes.status}`);
            }
          } catch (valErr: unknown) {
            const msg = valErr instanceof Error ? valErr.message : String(valErr);
            await admin
              .from('channels')
              .update({
                status: 'error',
                last_error: `Instagram validation failed: ${msg}`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', ch.id);
            ch.status = 'error';
            ch.last_error = `Instagram validation failed: ${msg}`;
            markedError++;
          }
        }
      } else {
        const validation = await validateWhatsAppToken(ch.provider_id, token);
        if (!validation.ok) {
          const errMsg = validation.error || 'Token inválido ou expirado';
          await admin
            .from('channels')
            .update({
              status: 'error',
              last_error: errMsg,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ch.id);
          ch.status = 'error';
          ch.last_error = errMsg;
          markedError++;
        }
      }
    },
    { deadlineMs: startedAt + 240_000 },
  );

  const errorChannels = (channels ?? []).filter((ch) => ch.status === 'error');
  let notified = 0;

  for (const channel of errorChannels) {
    const { data: members } = await admin
      .from('memberships')
      .select('user_id')
      .eq('company_id', channel.company_id);

    if (!members?.length) continue;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', channel.company_id)
      .eq('type', 'channel_error')
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) > 0) continue;

    const providerLabel = channel.provider === 'instagram' ? 'Instagram' : 'WhatsApp';
    await createNotificationForUsers(members, {
      company_id: channel.company_id,
      type: 'channel_error',
      title: `Canal ${providerLabel} com erro ⚠️`,
      body: channel.last_error
        ? `Erro no canal: ${String(channel.last_error).slice(0, 120)}`
        : `Um canal do ${providerLabel} está desconectado. Reconecte nas configurações.`,
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
    notified,
  });
}
