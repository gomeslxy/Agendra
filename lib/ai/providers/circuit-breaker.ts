// In-process circuit breaker — per-provider, TTL-based.
// Serverless-safe: each warm instance maintains its own state.
// Worst case on cold start: one wasted call to a broken provider per instance.
// This is acceptable vs. the complexity of a DB-backed shared state.

type CircuitStatus = 'closed' | 'open' | 'half-open';

interface CircuitState {
  status: CircuitStatus;
  failureCount: number;
  lastFailureAt: number;
  openUntil: number;
  halfOpenProbeAt: number;
}

const FAILURE_THRESHOLD = 2;        // trips after 2 consecutive failures
const OPEN_DURATION_MS = 30_000;    // stays open for 30s
const HALF_OPEN_COOLDOWN_MS = 5_000; // min 5s between half-open probes

const states = new Map<string, CircuitState>();

function getState(provider: string): CircuitState {
  return states.get(provider) ?? {
    status: 'closed',
    failureCount: 0,
    lastFailureAt: 0,
    openUntil: 0,
    halfOpenProbeAt: 0,
  };
}

export function getCircuitStatus(provider: string): CircuitStatus {
  const s = getState(provider);
  if (s.status === 'open' && Date.now() >= s.openUntil) return 'half-open';
  return s.status;
}

export function canAttempt(provider: string): boolean {
  const status = getCircuitStatus(provider);
  if (status === 'closed') return true;
  if (status === 'open') return false;
  // half-open: allow one probe at a time
  const s = getState(provider);
  if (Date.now() - s.halfOpenProbeAt < HALF_OPEN_COOLDOWN_MS) return false;
  states.set(provider, { ...s, status: 'half-open', halfOpenProbeAt: Date.now() });
  return true;
}

export function recordSuccess(provider: string): void {
  states.set(provider, {
    status: 'closed',
    failureCount: 0,
    lastFailureAt: 0,
    openUntil: 0,
    halfOpenProbeAt: 0,
  });
}

export function recordFailure(provider: string): void {
  const s = getState(provider);
  const isHalfOpen = getCircuitStatus(provider) === 'half-open';
  const newFailureCount = isHalfOpen ? FAILURE_THRESHOLD : s.failureCount + 1;

  if (newFailureCount >= FAILURE_THRESHOLD) {
    const openUntil = Date.now() + OPEN_DURATION_MS;
    console.warn(`[CircuitBreaker] ${provider} → OPEN until ${new Date(openUntil).toISOString()}`);
    states.set(provider, {
      status: 'open',
      failureCount: newFailureCount,
      lastFailureAt: Date.now(),
      openUntil,
      halfOpenProbeAt: 0,
    });
  } else {
    states.set(provider, {
      ...s,
      status: 'closed',
      failureCount: newFailureCount,
      lastFailureAt: Date.now(),
    });
  }
}
