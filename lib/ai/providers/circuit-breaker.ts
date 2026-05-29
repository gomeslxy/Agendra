// Distributed circuit breaker — per-provider, shared across serverless instances.
//
// Strategy: HYBRID cache.
//   - Source of truth lives in Upstash Redis (key `cb:{provider}`), so every warm
//     OR cold instance sees the same provider health and stops hammering a known
//     broken provider (fixes the "split-brain" cold-start problem).
//   - A process-local Map caches the state for a very short TTL (LOCAL_TTL_MS) so
//     the hot path does not pay a Redis round-trip on every single attempt.
//   - Half-open probes are coordinated with an atomic Redis SET NX lock so only
//     ONE instance probes a recovering provider at a time.
//
// Resilience: if Redis is offline, every call degrades SILENTLY to the local Map
// (the previous in-memory behavior). The breaker never throws.

import { redis } from '@/lib/infra/redis';

type CircuitStatus = 'closed' | 'open' | 'half-open';

interface CircuitState {
  status: 'closed' | 'open';
  failureCount: number;
  openUntil: number; // epoch ms; 0 when closed
}

const FAILURE_THRESHOLD = 2;          // trips after 2 consecutive failures
const OPEN_DURATION_MS = 30_000;      // stays open for 30s
const HALF_OPEN_COOLDOWN_MS = 5_000;  // min spacing between half-open probes
const LOCAL_TTL_MS = 4_000;           // hot-path cache window
const REDIS_TTL_SEC = 60;             // state key TTL in Redis

const DEFAULT_STATE: CircuitState = { status: 'closed', failureCount: 0, openUntil: 0 };

interface CacheEntry {
  state: CircuitState;
  fetchedAt: number;
}

const local = new Map<string, CacheEntry>();

function keyFor(provider: string): string {
  return `cb:${provider}`;
}

function localState(provider: string): CircuitState {
  return local.get(provider)?.state ?? DEFAULT_STATE;
}

function setLocal(provider: string, state: CircuitState): void {
  local.set(provider, { state, fetchedAt: Date.now() });
}

/**
 * Read state with the hybrid cache: serve from local Map within LOCAL_TTL_MS,
 * otherwise refresh from Redis. Falls back to local on any Redis failure.
 */
async function getState(provider: string): Promise<CircuitState> {
  const cached = local.get(provider);
  if (cached && Date.now() - cached.fetchedAt < LOCAL_TTL_MS) {
    return cached.state;
  }
  const raw = await redis.get(keyFor(provider)); // null on Redis offline OR missing key
  if (raw === null) {
    // Distinguish "Redis down" from "no state": we can't, cheaply — but either way
    // the safest behavior is to trust the local copy (or default = closed).
    const fallback = cached?.state ?? DEFAULT_STATE;
    setLocal(provider, fallback);
    return fallback;
  }
  let parsed: CircuitState;
  try {
    parsed = JSON.parse(raw) as CircuitState;
  } catch {
    parsed = DEFAULT_STATE;
  }
  setLocal(provider, parsed);
  return parsed;
}

function deriveStatus(s: CircuitState): CircuitStatus {
  if (s.status === 'open' && Date.now() >= s.openUntil) return 'half-open';
  return s.status;
}

/** Best-effort write-through to Redis. Never blocks the caller, never throws. */
function persist(provider: string, state: CircuitState): void {
  setLocal(provider, state);
  void redis.set(keyFor(provider), JSON.stringify(state), REDIS_TTL_SEC).catch(() => {});
}

/** Synchronous, local-cache-only status — for logging/diagnostics on the hot path. */
export function getCircuitStatus(provider: string): CircuitStatus {
  return deriveStatus(localState(provider));
}

/**
 * Can we attempt this provider right now? Async because it consults shared state.
 *  - closed  → yes
 *  - open    → no (until openUntil elapses)
 *  - half-open → yes for exactly ONE instance (atomic Redis probe lock), else no
 */
export async function canAttempt(provider: string): Promise<boolean> {
  const state = await getState(provider);
  const status = deriveStatus(state);

  if (status === 'closed') return true;
  if (status === 'open') return false;

  // half-open: single-flight probe. SET NX acts as a distributed lock.
  const probeKey = `cb:probe:${provider}`;
  const won = await redis.setNX(probeKey, '1', Math.ceil(HALF_OPEN_COOLDOWN_MS / 1000));
  if (won === true) return true;     // we own the probe slot
  if (won === false) return false;   // another instance is probing
  // Redis offline (null): degrade to local spacing so we still probe occasionally.
  const last = local.get(provider)?.fetchedAt ?? 0;
  if (Date.now() - last < HALF_OPEN_COOLDOWN_MS) return false;
  setLocal(provider, state);
  return true;
}

export function recordSuccess(provider: string): void {
  persist(provider, { status: 'closed', failureCount: 0, openUntil: 0 });
}

export function recordFailure(provider: string): void {
  // Read from local cache only (no await) to keep the failure path fast.
  const prev = localState(provider);
  const wasHalfOpen = deriveStatus(prev) === 'half-open';
  // A failed half-open probe must immediately re-open the circuit.
  const failureCount = wasHalfOpen ? FAILURE_THRESHOLD : prev.failureCount + 1;

  if (failureCount >= FAILURE_THRESHOLD) {
    const openUntil = Date.now() + OPEN_DURATION_MS;
    console.warn(`[CircuitBreaker] ${provider} → OPEN until ${new Date(openUntil).toISOString()}`);
    persist(provider, { status: 'open', failureCount, openUntil });
  } else {
    persist(provider, { status: 'closed', failureCount, openUntil: 0 });
  }
}
