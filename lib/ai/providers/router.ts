import { CerebrasAdapter } from './cerebras-adapter';
import { GroqAdapter } from './groq-adapter';
import { SambaNovaAdapter } from './sambanova-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { canAttempt, recordSuccess, recordFailure, getCircuitStatus } from './circuit-breaker';
import { assertCanAttempt, usableBudgetMs } from '../deadline';
import type {
  AIProviderAdapter, ChatParams, GenerateParams,
  ProviderName, ProviderRouteResult, ProviderGenerateResult, RouteOptions,
} from './types';

const CHAT_TIMEOUT_MS = 12_000;
const GEN_TIMEOUT_MS = 12_000;
const TOOLS_TIMEOUT_MS = 15_000; // IMP-4: tools chain gets more time (SambaNova cold starts)
const DEGRADED_TIMEOUT_MS = 25_000;

const cerebras = new CerebrasAdapter();
const groq = new GroqAdapter();
const sambanova = new SambaNovaAdapter();
const gemini = new GeminiAdapter();

const CONV_CHAIN: AIProviderAdapter[] = [gemini, cerebras, groq];
// Resiliência e cotas elevadas: Gemini (gemini-2.5-flash) lidera.
// Cerebras (gpt-oss-120b) e SambaNova atuam como fallbacks rápidos.
// Groq (llama-3.3-70b-versatile) rebaixado a fallback final para evitar estouro de TPD/429.
const TOOLS_CHAIN: AIProviderAdapter[] = [gemini, cerebras, sambanova, groq];
const BG_CHAIN: AIProviderAdapter[] = [gemini, groq];

function classifyError(err: any): { retryable: boolean; kind: string } {
  const status = err?.status ?? err?.statusCode ?? 0;
  const msg = String(err?.message ?? '').toLowerCase();
  if (status === 401 || status === 403) return { retryable: false, kind: 'auth_error' };
  if (status === 429 || msg.includes('rate') || msg.includes('quota')) return { retryable: true, kind: 'rate_limit' };
  if (status >= 500 || msg.includes('overload') || msg.includes('timeout') || msg.includes('unavailable')) return { retryable: true, kind: 'server_error' };
  return { retryable: true, kind: 'unknown' };
}

async function runChain<T>(
  chain: AIProviderAdapter[],
  exec: (p: AIProviderAdapter, signal: AbortSignal, timeout: number) => Promise<T>,
  baseTimeout: number,
  traceId?: string
): Promise<{ result: T; provider: ProviderName; fallbackUsed: boolean }> {
  const errors: string[] = [];
  let first: ProviderName | null = null;

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];

    // ── Active Deadline Supervisor ──────────────────────────────────────────
    // Bail out BEFORE spending the budget if there isn't enough time left to
    // both run an attempt AND let the engine clean up (release lock, handoff).
    // Throwing here (not returning a provider error) lets the engine run its
    // graceful human-handoff path instead of being abruptly killed by Vercel.
    try {
      assertCanAttempt();
    } catch (deadlineErr) {
      console.error(`[Router] ⏱️ deadline reached, skipping remaining providers trace=${traceId} (${errors.join('; ')})`);
      throw deadlineErr;
    }

    if (!(await canAttempt(provider.name))) {
      errors.push(`${provider.name}: circuit_${getCircuitStatus(provider.name)}`);
      continue;
    }
    if (!first) first = provider.name;

    // Per-attempt timeout = min(configured timeout, time we can actually afford).
    const configured = i === chain.length - 1 ? DEGRADED_TIMEOUT_MS : baseTimeout;
    const t = Math.max(1_000, Math.min(configured, Math.floor(usableBudgetMs())));

    const controller = new AbortController();
    // Real socket cancellation: aborting the controller closes the underlying
    // fetch, preventing leaked in-flight requests when we time out / fall over.
    const timer = setTimeout(
      () => controller.abort(new Error(`timeout_${t}ms`)),
      t,
    );
    const start = Date.now();
    try {
      const result = await exec(provider, controller.signal, t);
      recordSuccess(provider.name);
      console.log(`[Router] ✅ ${provider.name} ${Date.now() - start}ms trace=${traceId}`);
      return { result, provider: provider.name, fallbackUsed: provider.name !== first };
    } catch (err: any) {
      const timedOut = controller.signal.aborted;
      const { kind } = timedOut ? { kind: 'timeout' } : classifyError(err);
      recordFailure(provider.name);
      console.warn(`[Router] ❌ ${provider.name} ${kind} ${Date.now() - start}ms: ${err.message} trace=${traceId}`);
      errors.push(`${provider.name}:${kind}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}

export async function routeChat(
  params: ChatParams,
  opts: RouteOptions = {}
): Promise<ProviderRouteResult> {
  const chain = opts.chain === 'tools' ? TOOLS_CHAIN : CONV_CHAIN;
  const baseTimeout = opts.chain === 'tools' ? TOOLS_TIMEOUT_MS : CHAT_TIMEOUT_MS;
  const maxTokens = opts.chain !== 'tools' ? 250 : undefined;
  const { result, provider, fallbackUsed } = await runChain(
    chain,
    (p, signal, timeout) => p.chat({ ...params, signal, timeout, ...(maxTokens ? { maxTokens } : {}) }),
    baseTimeout,
    opts.traceId
  );
  return { ...result, provider, fallbackUsed };
}

export async function routeGenerate(
  params: GenerateParams,
  opts: RouteOptions = {}
): Promise<ProviderGenerateResult> {
  const chain = opts.chain === 'bg' ? BG_CHAIN : CONV_CHAIN;
  const { result, provider, fallbackUsed } = await runChain(
    chain, (p, signal, timeout) => p.generateText({ ...params, signal, timeout }), GEN_TIMEOUT_MS, opts.traceId
  );
  return { text: result, provider, fallbackUsed };
}
