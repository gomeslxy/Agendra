import { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from './registry';
import { ChannelConfig, SendResult } from './types';
import { logInfo, logError } from '@/lib/logging';

/**
 * Resolves the channel configuration for a company and target recipient.
 * 1. Checks if a lead exists for the recipient/phone in the company to find their associated channel.
 * 2. Fallbacks to the first active channel for the company.
 * 3. Fallbacks to environment variables in development.
 */
async function resolveChannelConfig(companyId: string, to: string): Promise<ChannelConfig> {
  const admin = createAdminClient();

  // 1. Try to find the lead to check if they have a preferred channel_id
  if (to) {
    try {
      const { data: lead } = await admin
        .from('leads')
        .select('channel, channel_id')
        .eq('company_id', companyId)
        .eq('phone', to)
        .maybeSingle();

      if (lead?.channel_id) {
        const { data: channel } = await admin
          .from('channels')
          .select('*')
          .eq('id', lead.channel_id)
          .maybeSingle();

        if (channel) {
          const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: channel.id });
          const accessToken = (tokenData as string) || channel.access_token;
          return {
            id: channel.id,
            companyId: channel.company_id,
            provider: channel.provider,
            providerId: channel.provider_id,
            accessToken: accessToken.trim(),
            meta: channel.meta || {},
            status: channel.status,
          };
        }
      }
    } catch (err: any) {
      logError('[Channel Send] Error querying lead channel:', err.message);
    }
  }

  // 2. Fallback: query active channels for the company
  try {
    const { data: channels } = await admin
      .from('channels')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'active');

    // Prefer whatsapp, then instagram, then any
    const channel = channels?.find(c => c.provider === 'whatsapp') || 
                    channels?.find(c => c.provider === 'instagram') || 
                    channels?.[0];

    if (channel) {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: channel.id });
      const accessToken = (tokenData as string) || channel.access_token;
      return {
        id: channel.id,
        companyId: channel.company_id,
        provider: channel.provider,
        providerId: channel.provider_id,
        accessToken: accessToken.trim(),
        meta: channel.meta || {},
        status: channel.status,
      };
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

  const config = await resolveChannelConfig(companyId, to);
  const adapter = getAdapter(config.provider);

  const result = await adapter.sendText(config, { to, text });

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

  const config = await resolveChannelConfig(companyId, to);
  const adapter = getAdapter(config.provider);

  const result = await adapter.sendMedia(config, {
    to,
    mediaUrl,
    mediaType,
    mediaCaption: caption,
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
export async function sendChannelTyping(to: string, companyId?: string): Promise<void> {
  if (!companyId || !to) return;

  try {
    const config = await resolveChannelConfig(companyId, to);
    const adapter = getAdapter(config.provider);

    if (adapter.sendTypingIndicator) {
      await adapter.sendTypingIndicator(config, to);
    }
  } catch {
    // Typing indicator is a best-effort failure-silent action
  }
}
