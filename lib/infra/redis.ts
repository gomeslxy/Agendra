export function isAvailable(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function callRaw<T>(path: string): Promise<{ result: T | null }> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  if (!url || !token) {
    throw new Error('Redis not available');
  }
  const res = await fetch(`${url}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(2_500),
  });
  if (!res.ok) {
    throw new Error(`Redis HTTP error: ${res.status}`);
  }
  return (await res.json()) as { result: T };
}

async function call<T>(path: string): Promise<T | null> {
  try {
    const res = await callRaw<T>(path);
    return res.result;
  } catch {
    return null;
  }
}

export const redis = {
  async setNX(key: string, value: string, ttlSec: number): Promise<true | false | null> {
    if (!isAvailable()) return null;
    try {
      const res = await callRaw<string>(
        `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?NX=true&EX=${ttlSec}`,
      );
      // Upstash REST API returns { result: "OK" } on success or { result: null } if NX fails
      return res.result === 'OK' ? true : false;
    } catch (err) {
      // Return null only on genuine connection/HTTP failures
      return null;
    }
  },

  async set(key: string, value: string, ttlSec: number): Promise<true | null> {
    if (!isAvailable()) return null;
    const r = await call<string>(
      `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSec}`,
    );
    return r === 'OK' ? true : null;
  },

  async get(key: string): Promise<string | null> {
    return call<string | null>(`get/${encodeURIComponent(key)}`);
  },

  async del(key: string): Promise<void> {
    await call<number>(`del/${encodeURIComponent(key)}`);
  },

  async rpush(key: string, value: string): Promise<number | null> {
    return call<number>(
      `rpush/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
    );
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return (
      (await call<string[]>(
        `lrange/${encodeURIComponent(key)}/${start}/${stop}`,
      )) ?? []
    );
  },

  async expire(key: string, ttlSec: number): Promise<void> {
    await call<number>(`expire/${encodeURIComponent(key)}/${ttlSec}`);
  },

  async incr(key: string): Promise<number | null> {
    return call<number>(`incr/${encodeURIComponent(key)}`);
  },

  /**
   * Atomic claim-and-drain for the debounce flush.
   *
   * Executes atomically via Lua eval:
   *   1. Read tokenKey — if value ≠ expectedGen, return null (superseded or Redis offline).
   *   2. Read all items from bufKey.
   *   3. DEL both keys.
   *   4. Return the buffer items.
   *
   * Returns:
   *   string[]  — this caller won the race; items are the buffer contents (may be empty).
   *   null      — genuinely superseded by a newer flusher (token mismatch).
   *
   * Throws on Redis unavailable OR transient HTTP error, so the caller can let the
   * delivery be retried (QStash) instead of fabricating a placeholder or silently
   * dropping the lead's message. Distinguishing "superseded" (null) from "couldn't
   * reach Redis" (throw) is what prevents the silent message-loss path.
   */
  async claimAndFlush(tokenKey: string, bufKey: string, expectedGen: string): Promise<string[] | null> {
    if (!isAvailable()) throw new Error('redis_unavailable');
    const script = `
local token = redis.call('GET', KEYS[1])
if token ~= ARGV[1] then return nil end
local buf = redis.call('LRANGE', KEYS[2], 0, -1)
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return buf
`.trim();
    // callRaw throws on connection/HTTP failure — let it propagate (transient).
    const res = await callRaw<string[] | null>(
      `eval/${encodeURIComponent(script)}/2/${encodeURIComponent(tokenKey)}/${encodeURIComponent(bufKey)}/${encodeURIComponent(expectedGen)}`,
    );
    if (res.result === null) return null; // Lua `return nil` = token mismatch = superseded
    return Array.isArray(res.result) ? res.result : null;
  },
};
