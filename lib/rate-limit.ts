type RateLimitEntry = { count: number; resetAt: number };

const store = new Map<string, RateLimitEntry>();

/**
 * In-memory rate limiter. State resets on server restart and is not shared
 * across serverless instances. Sufficient for MVP; replace with Upstash Redis at scale.
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}
