import Redis from 'ioredis';

// Mantém apenas uma instância TCP no ambiente Serverless/Dev
let tcpRedis: Redis | null = null;

if (process.env.UPSTASH_REDIS_URL) {
  const globalAny = global as any;
  if (!globalAny._tcpRedis) {
    globalAny._tcpRedis = new Redis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null; // Desiste após 3 tentativas para evitar hang
        return Math.min(times * 50, 1000);
      },
      // Timeout configurado para o ambiente serverless
      commandTimeout: 2500,
    });
    // Sem este listener, erros de conexão emitem 'error' sem handler no
    // EventEmitter → "[ioredis] Unhandled error event" e potencial crash do
    // function no meio de um turn (visto no cron flush-buffer em prod).
    // Os comandos já têm try/catch individual; aqui só absorvemos o evento.
    globalAny._tcpRedis.on('error', (err: Error) => {
      console.warn('[redis] connection error (handled):', err?.message);
    });
  }
  tcpRedis = globalAny._tcpRedis;
}

export function isAvailable(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_URL || 
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
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

export const redis = {
  async setNX(key: string, value: string, ttlSec: number): Promise<true | false | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        const res = await tcpRedis.set(key, value, 'EX', ttlSec, 'NX');
        return res === 'OK' ? true : false;
      } catch (err) {
        return null; // Retorna null em caso de falha de conexão (comportamento original)
      }
    }
    // Fallback REST
    try {
      const res = await callRaw<string>(
        `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?NX=true&EX=${ttlSec}`,
      );
      return res.result === 'OK' ? true : false;
    } catch (err) {
      return null;
    }
  },

  async set(key: string, value: string, ttlSec: number): Promise<true | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try {
        const res = await tcpRedis.set(key, value, 'EX', ttlSec);
        return res === 'OK' ? true : null;
      } catch (err) {
        return null;
      }
    }
    // Fallback REST
    const r = await call<string>(`set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSec}`);
    return r === 'OK' ? true : null;
  },

  async get(key: string): Promise<string | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try { return await tcpRedis.get(key); } catch { return null; }
    }
    return call<string | null>(`get/${encodeURIComponent(key)}`);
  },

  async del(key: string): Promise<void> {
    if (!isAvailable()) return;
    if (tcpRedis) {
      try { await tcpRedis.del(key); } catch {}
      return;
    }
    await call<number>(`del/${encodeURIComponent(key)}`);
  },

  async rpush(key: string, value: string): Promise<number | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try { return await tcpRedis.rpush(key, value); } catch { return null; }
    }
    return call<number>(`rpush/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!isAvailable()) return [];
    if (tcpRedis) {
      try { return await tcpRedis.lrange(key, start, stop); } catch { return []; }
    }
    return ((await call<string[]>(`lrange/${encodeURIComponent(key)}/${start}/${stop}`)) ?? []);
  },

  async expire(key: string, ttlSec: number): Promise<void> {
    if (!isAvailable()) return;
    if (tcpRedis) {
      try { await tcpRedis.expire(key, ttlSec); } catch {}
      return;
    }
    await call<number>(`expire/${encodeURIComponent(key)}/${ttlSec}`);
  },

  async incr(key: string): Promise<number | null> {
    if (!isAvailable()) return null;
    if (tcpRedis) {
      try { return await tcpRedis.incr(key); } catch { return null; }
    }
    return call<number>(`incr/${encodeURIComponent(key)}`);
  },

  /**
   * Atomic claim-and-drain for the debounce flush.
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

    if (tcpRedis) {
      // Propaga o erro caso haja falha genuína, permitindo o retry pelo webhook
      const res = await tcpRedis.eval(script, 2, tokenKey, bufKey, expectedGen) as string[] | null;
      return res; // Retorna nulo se houver mismatch de token
    }

    // Fallback REST
    const res = await callRaw<string[] | null>(
      `eval/${encodeURIComponent(script)}/2/${encodeURIComponent(tokenKey)}/${encodeURIComponent(bufKey)}/${encodeURIComponent(expectedGen)}`,
    );
    if (res.result === null) return null;
    return Array.isArray(res.result) ? res.result : null;
  },
};
