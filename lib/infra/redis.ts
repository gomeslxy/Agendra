import Redis from 'ioredis';
import { logError } from '@/lib/logging';

interface GlobalWithRedis {
  _tcpRedis?: Redis;
}

// Mantém apenas uma instância TCP no ambiente Serverless/Dev
let tcpRedis: Redis | null = null;

if (process.env.UPSTASH_REDIS_URL) {
  const globalStore = globalThis as unknown as GlobalWithRedis;
  if (!globalStore._tcpRedis) {
    globalStore._tcpRedis = new Redis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null; // Desiste após 3 tentativas para evitar hang
        return Math.min(times * 50, 1000);
      },
      commandTimeout: 2500,
    });
    globalStore._tcpRedis.on('error', (err: Error) => {
      logError('[redis] connection error (handled):', err?.message);
    });
  }
  tcpRedis = globalStore._tcpRedis;
}

export function isAvailable(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_URL ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

async function callRaw<T>(path: string): Promise<{ result: T | null }> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  if (!url || !token) {
    throw new Error('Redis REST API not configured');
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

async function evalScript<T>(
  script: string,
  keys: string[],
  args: string[],
): Promise<T | null> {
  if (!isAvailable()) {
    throw new Error('redis_unavailable');
  }

  if (tcpRedis) {
    const res = await tcpRedis.eval(script, keys.length, ...keys, ...args);
    return res as T | null;
  }

  const encodedParts = [...keys, ...args].map((p) => encodeURIComponent(p)).join('/');
  const suffix = encodedParts ? `/${encodedParts}` : '';
  const res = await callRaw<T>(`eval/${encodeURIComponent(script)}/${keys.length}${suffix}`);
  return res.result;
}

export const redis = {
  async setNX(key: string, value: string, ttlSec: number): Promise<true | false | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        const res = await tcpRedis.set(key, value, 'EX', ttlSec, 'NX');
        return res === 'OK';
      } catch {
        return null;
      }
    }
    try {
      const res = await callRaw<string>(
        `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?NX=true&EX=${ttlSec}`,
      );
      return res.result === 'OK';
    } catch {
      return null;
    }
  },

  async set(key: string, value: string, ttlSec: number): Promise<true | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        const res = await tcpRedis.set(key, value, 'EX', ttlSec);
        return res === 'OK' ? true : null;
      } catch {
        return null;
      }
    }
    const r = await call<string>(
      `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSec}`,
    );
    return r === 'OK' ? true : null;
  },

  async get(key: string): Promise<string | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        return await tcpRedis.get(key);
      } catch {
        return null;
      }
    }
    return call<string | null>(`get/${encodeURIComponent(key)}`);
  },

  async del(key: string): Promise<void> {
    if (!isAvailable()) return;
    if (tcpRedis) {
      try {
        await tcpRedis.del(key);
      } catch {
        // non-fatal
      }
      return;
    }
    await call<number>(`del/${encodeURIComponent(key)}`);
  },

  async rpush(key: string, value: string): Promise<number | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        return await tcpRedis.rpush(key, value);
      } catch {
        return null;
      }
    }
    return call<number>(`rpush/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!isAvailable()) return [];
    if (tcpRedis) {
      try {
        return await tcpRedis.lrange(key, start, stop);
      } catch {
        return [];
      }
    }
    return (await call<string[]>(`lrange/${encodeURIComponent(key)}/${start}/${stop}`)) ?? [];
  },

  async expire(key: string, ttlSec: number): Promise<void> {
    if (!isAvailable()) return;
    if (tcpRedis) {
      try {
        await tcpRedis.expire(key, ttlSec);
      } catch {
        // non-fatal
      }
      return;
    }
    await call<number>(`expire/${encodeURIComponent(key)}/${ttlSec}`);
  },

  async incr(key: string): Promise<number | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        return await tcpRedis.incr(key);
      } catch {
        return null;
      }
    }
    return call<number>(`incr/${encodeURIComponent(key)}`);
  },

  /**
   * Atomic fixed-window counter with self-healing TTL for orphan keys (PTTL == -1).
   */
  async rateLimitIncr(key: string, windowMs: number): Promise<number | null> {
    if (!isAvailable()) return null;
    const boundedMs = Math.max(1, Math.ceil(windowMs));
    const script = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
elseif redis.call('PTTL', KEYS[1]) == -1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`.trim();

    try {
      const res = await evalScript<number | string>(script, [key], [String(boundedMs)]);
      if (res === null || res === undefined) return null;
      const num = Number(res);
      return Number.isFinite(num) ? num : null;
    } catch {
      return null;
    }
  },

  /**
   * Claim exclusivo de geração do debounce via Lua CAS.
   * Retorna:
   * - `true`: este worker assumiu a geração (`flushing:{gen}`)
   * - `false`: outro worker já assumiu ou superou o token
   * - `null`: Redis indisponível (caller decide fallback para dedup PG)
   */
  async claimFlushGen(
    tokenKey: string,
    expectedGen: string,
    inflightTtlSec = 280,
  ): Promise<boolean | null> {
    if (!isAvailable()) return null;
    const script = `
local current = redis.call('GET', KEYS[1])
if current and current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], 'flushing:' .. ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
`.trim();

    try {
      const res = await evalScript<number | string>(
        script,
        [tokenKey],
        [expectedGen, String(inflightTtlSec)],
      );
      if (res === null || res === undefined) return null;
      return Number(res) === 1;
    } catch (err) {
      logError('[redis] claimFlushGen failed (proceeding with PG dedup):', err);
      return null;
    }
  },

  /**
   * Libera o token de geração apenas se ainda pertencer a este worker (`gen` ou `flushing:gen`).
   */
  async releaseFlushGen(tokenKey: string, expectedGen: string): Promise<void> {
    if (!isAvailable()) return;
    const script = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] or current == ('flushing:' .. ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`.trim();

    try {
      await evalScript<number>(script, [tokenKey], [expectedGen]);
    } catch (err) {
      logError('[redis] releaseFlushGen failed (non-fatal):', err);
    }
  },

  /**
   * Remove apenas os `consumedCount` primeiros itens de `pre_ids` após commit do turno,
   * preservando IDs de mensagens que chegaram concorrentemente durante o processamento.
   */
  async trimPrePersistedIds(key: string, consumedCount: number): Promise<void> {
    if (!isAvailable() || consumedCount <= 0) return;
    const script = `
local n = tonumber(ARGV[1])
if n <= 0 then return 0 end
local len = redis.call('LLEN', KEYS[1])
if len <= n then
  redis.call('DEL', KEYS[1])
else
  redis.call('LTRIM', KEYS[1], n, -1)
end
return 1
`.trim();

    try {
      await evalScript<number>(script, [key], [String(consumedCount)]);
    } catch (err) {
      logError('[redis] trimPrePersistedIds failed (non-fatal):', err);
    }
  },

  /**
   * Atomic claim-and-drain legado.
   */
  async claimAndFlush(
    tokenKey: string,
    bufKey: string,
    expectedGen: string,
  ): Promise<string[] | null> {
    const script = `
local token = redis.call('GET', KEYS[1])
if token ~= ARGV[1] then return nil end
local buf = redis.call('LRANGE', KEYS[2], 0, -1)
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return buf
`.trim();

    const res = await evalScript<string[] | null>(
      script,
      [tokenKey, bufKey],
      [expectedGen],
    );
    if (res === null) return null;
    return Array.isArray(res) ? res : null;
  },
};
