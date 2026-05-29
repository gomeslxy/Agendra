/**
 * Active Deadline Supervisor — context propagation.
 *
 * Tracks how much wall-clock budget the current AI turn has left before the
 * Vercel function is hard-killed by the platform (maxDuration). We propagate it
 * via AsyncLocalStorage so the router/providers can read it WITHOUT threading a
 * parameter through every layer (engine → processLeadMessage → tools → router).
 *
 * The supervisor lets the router make adaptive choices:
 *  - cap each provider attempt to the time actually remaining (never overrun);
 *  - skip slow/unstable providers when the remaining budget is too small;
 *  - bail out early (DeadlineExceededError) so the engine can run its graceful
 *    human-handoff + atomic lock release BEFORE the platform kills the process.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface Deadline {
  /** Absolute epoch ms when the turn must be fully wrapped up. */
  readonly deadlineAt: number;
  /** Epoch ms when the turn started (for diagnostics). */
  readonly startedAt: number;
}

/**
 * Total budget for one AI turn. Vercel functions default to 300s; we reserve a
 * safety margin so the engine always has time to release locks + persist logs
 * + send the human-handoff message before the platform pulls the plug.
 */
export const TURN_BUDGET_MS = Number(process.env.AI_TURN_BUDGET_MS ?? 270_000);

/**
 * Time we must keep in reserve, after the last provider returns, to run cleanup
 * (release lead lock, mark processed_messages, send fallback message).
 */
export const CLEANUP_RESERVE_MS = Number(process.env.AI_CLEANUP_RESERVE_MS ?? 8_000);

/** Smallest window worth risking a brand-new provider attempt. */
export const MIN_ATTEMPT_MS = 2_500;

const storage = new AsyncLocalStorage<Deadline>();

export class DeadlineExceededError extends Error {
  constructor(remainingMs: number) {
    super(`AI_DEADLINE_EXCEEDED: only ${remainingMs}ms left, below cleanup reserve`);
    this.name = 'DeadlineExceededError';
  }
}

/** Run `fn` inside a fresh deadline context. */
export function runWithDeadline<T>(fn: () => Promise<T>, budgetMs: number = TURN_BUDGET_MS): Promise<T> {
  const now = Date.now();
  return storage.run({ startedAt: now, deadlineAt: now + budgetMs }, fn);
}

/** Current deadline, or null when running outside a supervised turn (e.g. cron). */
export function getDeadline(): Deadline | null {
  return storage.getStore() ?? null;
}

/** Milliseconds left before the hard deadline. Infinity when unsupervised. */
export function remainingMs(): number {
  const d = storage.getStore();
  if (!d) return Number.POSITIVE_INFINITY;
  return d.deadlineAt - Date.now();
}

/** Usable budget for a provider attempt: time left minus the cleanup reserve. */
export function usableBudgetMs(): number {
  const r = remainingMs();
  if (r === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return r - CLEANUP_RESERVE_MS;
}

/**
 * Throws DeadlineExceededError when there isn't enough time left to safely run
 * another provider attempt AND still clean up. Call before each attempt.
 */
export function assertCanAttempt(): void {
  const usable = usableBudgetMs();
  if (usable < MIN_ATTEMPT_MS) {
    throw new DeadlineExceededError(Math.max(0, Math.round(remainingMs())));
  }
}
