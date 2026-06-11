import { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from './registry';
import { ChannelConfig, SendResult } from './types';
import { logInfo, logError } from '@/lib/logging';
import { sanitizeClientResponse } from '@/lib/ai/sanitizer';

/**
 * Resolves the channel configuration for a company and target recipient.
 * 1. Checks if a lead exists for the recipient/phone in the company to find their associated channel.
 * 2. Fallbacks to the first active channel for the company.
 * 3. Fallbacks to environment variables in development.
 */
// Builds a ChannelConfig from a channels row, resolving the token from the Vault
// (channel_get_access_token) with a plaintext fallback. Returns null if no usable token
// so the caller can keep looking instead of crashing on `.trim()` of a null token.
async function buildConfigFromChannel(
  admin: ReturnType<typeof createAdminClient>,
  channel: any,
): Promise<ChannelConfig | null> {
  const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: channel.id });
  const rawToken = (tokenData as string | null) ?? channel.access_token;
  if (!rawToken) {
    logError(`[Channel Send] Channel ${channel.id} (${channel.provider}) has no usable access token`);
    return null;
  }
  return {
    id: channel.id,
    companyId: channel.company_id,
    provider: channel.provider,
    providerId: channel.provider_id,
    accessToken: rawToken.trim(),
    meta: channel.meta || {},
    status: channel.status,
  };
}

async function resolveChannelConfig(companyId: string, to: string): Promise<ChannelConfig> {
  const admin = createAdminClient();

  // 1. Try to find the lead to learn its preferred channel (by channel_id, else by provider).
  let preferredProvider: string | null = null;
  if (to) {
    try {
      const { data: lead } = await admin
        .from('leads')
        .select('channel, channel_id')
        .eq('company_id', companyId)
        .eq('phone', to)
        .maybeSingle();

      preferredProvider = lead?.channel ?? null;

      if (lead?.channel_id) {
        const { data: channel } = await admin
          .from('channels')
          .select('*')
          .eq('id', lead.channel_id)
          .eq('company_id', companyId) // CRITICAL: Strict Multi-tenant boundary isolation
          .maybeSingle();

        if (channel) {
          const config = await buildConfigFromChannel(admin, channel);
          if (config) return config;
        }
      }
    } catch (err: any) {
      logError('[Channel Send] Error querying lead channel:', err.message);
    }
  }

  // 2. Fallback: pick an active channel for the company. Prefer the lead's own provider
  //    (so an Instagram lead is never answered on the WhatsApp channel), then whatsapp,
  //    then instagram, then any. channel_id is the ideal link but may be null for legacy leads.
  try {
    const { data: channels } = await admin
      .from('channels')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'active');

    const channel =
      (preferredProvider && channels?.find(c => c.provider === preferredProvider)) ||
      channels?.find(c => c.provider === 'whatsapp') ||
      channels?.find(c => c.provider === 'instagram') ||
      channels?.[0];

    if (channel) {
      const config = await buildConfigFromChannel(admin, channel);
      if (config) return config;
    }
  } catch (err: any) {
    logError('[Channel Send] Error querying active company channels:', err.message);
  }

  // 3. Fallback: check environment variables in development
  if (process.env.NODE_ENV === 'development' || !companyId) {
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;
    if (phoneId && token) {
      logInfo('[Channel Send] Using fallback environment credentials for WhatsApp');
      return {
        id: '00000000-0000-0000-0000-000000000000',
        companyId: companyId || '00000000-0000-0000-0000-000000000000',
        provider: 'whatsapp',
        providerId: phoneId,
        accessToken: token.startsWith('Bearer ') ? token.substring(7).trim() : token.trim(),
        meta: {},
        status: 'active',
      };
    }
  }

  throw new Error(`Nenhum canal ativo configurado para a empresa ${companyId} e destinatário ${to}`);
}

/**
 * Sends a text message through the unified channel abstraction layer.
 */
export async function sendChannelMessage(to: string, text: string, companyId?: string): Promise<SendResult> {
  if (!companyId) {
    throw new Error('companyId is required to send messages.');
  }

  const sanitizedText = sanitizeClientResponse(text);
  const config = await resolveChannelConfig(companyId, to);
  const adapter = getAdapter(config.provider);

  const result = await adapter.sendText(config, { to, text: sanitizedText });

  if (!result.ok) {
    throw new Error(result.error || 'Failed to send channel text message');
  }

  return result;
}

/**
 * Sends media (image, video, document, audio) through the unified channel abstraction layer.
 */
export async function sendChannelMedia(
  to: string,
  mediaUrl: string,
  mediaType: 'image' | 'document' | 'video' | 'audio',
  filename: string,
  caption: string,
  companyId?: string,
  audioBuffer?: Buffer
): Promise<SendResult> {
  if (!companyId) {
    throw new Error('companyId is required to send media.');
  }

  const sanitizedCaption = sanitizeClientResponse(caption);
  const config = await resolveChannelConfig(companyId, to);
  const adapter = getAdapter(config.provider);

  const result = await adapter.sendMedia(config, {
    to,
    mediaUrl,
    mediaType,
    mediaCaption: sanitizedCaption,
    filename,
    audioBuffer,
  });

  if (!result.ok) {
    throw new Error(result.error || 'Failed to send channel media message');
  }

  return result;
}

/**
 * Triggers typing indicator through the unified channel abstraction layer.
 */
export async function sendChannelTyping(to: string, companyId?: string, messageId?: string): Promise<void> {
  if (!companyId || !to) return;

  try {
    const config = await resolveChannelConfig(companyId, to);
    const adapter = getAdapter(config.provider);

    if (adapter.sendTypingIndicator) {
      await adapter.sendTypingIndicator(config, messageId || to);
    }
  } catch {
    // Typing indicator is a best-effort failure-silent action
  }
}
