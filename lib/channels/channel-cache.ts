import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { redis, isAvailable as isRedisAvailable } from '@/lib/infra/redis';
import type { ChannelProvider } from './types';
import { logInfo } from '@/lib/logging';

const CACHE_TTL_SEC = 120;
const KEY_PREFIX = 'cache:ch:route';

export interface CachedChannelRoute {
  id: string;
  companyId: string;
  provider: ChannelProvider;
  providerId: string;
  status: string;
  subscriptionStatus: string | null;
  meta: Record<string, unknown>;
  accessToken: string | null;
}

interface StoredChannelEnvelope {
  id: string;
  companyId: string;
  provider: ChannelProvider;
  providerId: string;
  status: string;
  subscriptionStatus: string | null;
  meta: Record<string, unknown>;
  encToken: string | null;
}

function isCacheDisabled(): boolean {
  return process.env.DISABLE_CHANNEL_CACHE === 'true';
}

function getEncryptionKey(): Buffer | null {
  const secret = process.env.CHANNEL_CACHE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptToken(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptToken(encoded: string, key: Buffer): string | null {
  const parts = encoded.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const data = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function cacheKeyFor(provider: ChannelProvider, providerId: string): string {
  return `${KEY_PREFIX}:${provider}:${providerId}`;
}

/**
 * Resolves channel metadata, company subscription_status and decrypted access token,
 * using an encrypted Redis cache (TTL 120s) when enabled.
 */
export async function resolveChannelRoute(
  provider: ChannelProvider,
  providerId: string,
): Promise<CachedChannelRoute | null> {
  if (!providerId) return null;

  const redisKey = cacheKeyFor(provider, providerId);
  const encKey = getEncryptionKey();

  if (!isCacheDisabled() && isRedisAvailable() && encKey) {
    try {
      const raw = await redis.get(redisKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredChannelEnvelope;
        const accessToken = parsed.encToken ? decryptToken(parsed.encToken, encKey) : null;
        if (!parsed.encToken || accessToken !== null) {
          return {
            id: parsed.id,
            companyId: parsed.companyId,
            provider: parsed.provider,
            providerId: parsed.providerId,
            status: parsed.status,
            subscriptionStatus: parsed.subscriptionStatus,
            meta: parsed.meta ?? {},
            accessToken,
          };
        }
      }
    } catch (err) {
      logInfo('[channel-cache] Redis read failed, falling back to DB:', err);
    }
  }

  const admin = createAdminClient();
  const { data: channel, error } = await admin
    .from('channels')
    .select('id, company_id, provider, provider_id, status, meta, access_token, access_token_secret_id')
    .eq('provider', provider)
    .eq('provider_id', providerId)
    .maybeSingle();

  if (error || !channel) return null;

  let accessToken: string | null = (channel.access_token as string | null) ?? null;
  if (!accessToken && channel.access_token_secret_id) {
    const { data: tokenData } = await admin.rpc('channel_get_access_token', {
      p_channel_id: channel.id,
    });
    accessToken = (tokenData as string | null) ?? null;
  }

  const { data: company } = await admin
    .from('companies')
    .select('subscription_status')
    .eq('id', channel.company_id)
    .maybeSingle();

  if (!company) return null;

  const resolved: CachedChannelRoute = {
    id: channel.id as string,
    companyId: channel.company_id as string,
    provider,
    providerId: channel.provider_id as string,
    status: (channel.status as string) ?? 'active',
    subscriptionStatus: (company.subscription_status as string | null) ?? null,
    meta: (channel.meta as Record<string, unknown> | null) ?? {},
    accessToken,
  };

  if (!isCacheDisabled() && isRedisAvailable() && encKey) {
    try {
      const envelope: StoredChannelEnvelope = {
        id: resolved.id,
        companyId: resolved.companyId,
        provider: resolved.provider,
        providerId: resolved.providerId,
        status: resolved.status,
        subscriptionStatus: resolved.subscriptionStatus,
        meta: resolved.meta,
        encToken: resolved.accessToken ? encryptToken(resolved.accessToken, encKey) : null,
      };
      await redis.set(redisKey, JSON.stringify(envelope), CACHE_TTL_SEC);
    } catch (err) {
      logInfo('[channel-cache] Redis write failed (non-fatal):', err);
    }
  }

  return resolved;
}

export async function invalidateChannelCache(
  provider: ChannelProvider,
  providerId: string,
): Promise<void> {
  if (!providerId || !isRedisAvailable()) return;
  await redis.del(cacheKeyFor(provider, providerId));
}

export async function invalidateCompanyChannelCaches(companyId: string): Promise<void> {
  if (!companyId || !isRedisAvailable()) return;
  try {
    const admin = createAdminClient();
    const { data: channels } = await admin
      .from('channels')
      .select('provider, provider_id')
      .eq('company_id', companyId);

    for (const ch of channels ?? []) {
      if (ch.provider && ch.provider_id) {
        await redis.del(cacheKeyFor(ch.provider as ChannelProvider, ch.provider_id as string));
      }
    }
  } catch (err) {
    logInfo('[channel-cache] Failed to invalidate company channel caches:', err);
  }
}
