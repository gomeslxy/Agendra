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
};
