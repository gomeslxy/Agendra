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

// ── Per-turn channel config cache ────────────────────────────────────────────
// resolveChannelConfig runs 2-3 DB queries (lead lookup + channel lookup + Vault
// token-decrypt RPC). During a single AI turn it's called on every typing ping
// (4s interval) AND each reply part — all resolving the SAME channel. That's
// ~12-15 redundant Supabase round-trips on the hot path, directly delaying the
// reply reaching the lead. Cache the resolved config briefly so a turn resolves
// once. TTL is short so a rotated token is picked up fast; a send failure busts
// the entry immediately (invalidateChannelConfig) so a 401 self-heals on retry.
const CONFIG_CACHE_TTL_MS = 30_000;
const configCache = new Map<string, { config: ChannelConfig; expires: number }>();

function configCacheKey(companyId: string, to: string): string {
  return `${companyId}::${to}`;
}

export function invalidateChannelConfig(companyId: string, to: string): void {
  configCache.delete(configCacheKey(companyId, to));
}

/** Drops every cached channel config. Use after a company-wide token rotation. */
export function clearChannelConfigCache(): void {
  configCache.clear();
}

/**
 * Resolves a ChannelConfig with a short-lived in-memory cache. Use this on the
 * message-send hot path (typing pings, reply parts) to avoid re-querying the same
 * channel several times per turn. Falls through to a fresh resolve on cache miss.
 */
export async function getChannelConfig(companyId: string, to: string): Promise<ChannelConfig> {
  const key = configCacheKey(companyId, to);
  const hit = configCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.config;

  const config = await resolveChannelConfig(companyId, to);

  // Bound memory: prune expired entries before inserting when the map grows large.
  if (configCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of configCache) if (v.expires <= now) configCache.delete(k);
  }
  configCache.set(key, { config, expires: Date.now() + CONFIG_CACHE_TTL_MS });
  return config;
}

/**
 * Sends a text message through the unified channel abstraction layer.
 */
export async function sendChannelMessage(to: string, text: string, companyId?: string): Promise<SendResult> {
  if (!companyId) {
    throw new Error('companyId is required to send messages.');
  }

  const sanitizedText = sanitizeClientResponse(text);
  const config = await getChannelConfig(companyId, to);
  const adapter = getAdapter(config.provider);

  const result = await adapter.sendText(config, { to, text: sanitizedText });

  if (!result.ok) {
    // Bust the cache so a stale/expired token doesn't keep failing the whole turn.
    invalidateChannelConfig(companyId, to);
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
  const config = await getChannelConfig(companyId, to);
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
    invalidateChannelConfig(companyId, to);
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
    const config = await getChannelConfig(companyId, to);
    const adapter = getAdapter(config.provider);

    if (adapter.sendTypingIndicator) {
      await adapter.sendTypingIndicator(config, messageId || to);
    }
  } catch {
    // Typing indicator is a best-effort failure-silent action
  }
}
