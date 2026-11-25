import { redis, isAvailable } from '@/lib/infra/redis';

type RateLimitEntry = { count: number; resetAt: number };

// In-process fallback used only when Redis is unavailable (local dev without Upstash).
// On Vercel each instance has its own map — not shared across instances.
const localStore = new Map<string, RateLimitEntry>();

function checkLocal(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = localStore.get(key);
  if (!entry || now > entry.resetAt) {
    localStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/**
 * Distributed atomic rate limiter backed by Upstash Redis Lua script (`INCR` + `PEXPIRE`).
 * Falls back to in-process map when Redis is unavailable.
 * @returns true if allowed, false if rate limited
 */
export async function checkRateLimitAsync(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  if (!isAvailable()) return checkLocal(key, maxRequests, windowMs);

  try {
    const count = await redis.rateLimitIncr(`rl:${key}`, windowMs);
    if (count === null) return checkLocal(key, maxRequests, windowMs);
    return count <= maxRequests;
  } catch {
    return checkLocal(key, maxRequests, windowMs);
  }
}

/**
 * Sync wrapper kept for callers that cannot be easily made async.
 * Uses local fallback only — prefer checkRateLimitAsync for real protection.
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  return checkLocal(key, maxRequests, windowMs);
}
