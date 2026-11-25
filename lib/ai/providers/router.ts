import { CerebrasAdapter } from './cerebras-adapter';
import { GroqAdapter } from './groq-adapter';
import { SambaNovaAdapter } from './sambanova-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { canAttempt, recordSuccess, recordFailure, getCircuitStatus } from './circuit-breaker';
import { assertCanAttempt, usableBudgetMs } from '../deadline';
import { logDebug, logError } from '@/lib/logging';
import type {
  AIProviderAdapter,
  ChatParams,
  GenerateParams,
  ProviderName,
  ProviderRouteResult,
  ProviderGenerateResult,
  RouteOptions,
} from './types';

const CHAT_TIMEOUT_MS = 12_000;
const GEN_TIMEOUT_MS = 12_000;
const TOOLS_TIMEOUT_MS = 15_000;
const DEGRADED_TIMEOUT_MS = 25_000;

const cerebras = new CerebrasAdapter();
const groq = new GroqAdapter();
const sambanova = new SambaNovaAdapter();
const gemini = new GeminiAdapter();

const CONV_CHAIN: AIProviderAdapter[] = [gemini, cerebras, groq];
const TOOLS_CHAIN: AIProviderAdapter[] = [gemini, cerebras, sambanova, groq];
const BG_CHAIN: AIProviderAdapter[] = [gemini, groq];

function classifyError(err: unknown): { retryable: boolean; kind: string } {
  const errObj = err as { status?: number; statusCode?: number; message?: string } | null;
  const status = errObj?.status ?? errObj?.statusCode ?? 0;
  const msg = String(errObj?.message ?? '').toLowerCase();
  if (status === 401 || status === 403) return { retryable: false, kind: 'auth_error' };
  if (status === 429 || msg.includes('rate') || msg.includes('quota')) {
    return { retryable: true, kind: 'rate_limit' };
  }
  if (
    status >= 500 ||
    msg.includes('overload') ||
    msg.includes('timeout') ||
    msg.includes('unavailable')
  ) {
    return { retryable: true, kind: 'server_error' };
  }
  return { retryable: true, kind: 'unknown' };
}

async function runChain<T>(
  chain: AIProviderAdapter[],
  exec: (p: AIProviderAdapter, signal: AbortSignal, timeout: number) => Promise<T>,
  baseTimeout: number,
  traceId?: string,
): Promise<{
  result: T;
  provider: ProviderName;
  attemptedProviders: ProviderName[];
  fallbackUsed: boolean;
}> {
  const errors: string[] = [];
  const attemptedProviders: ProviderName[] = [];
  let first: ProviderName | null = null;

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];

    try {
      assertCanAttempt();
    } catch (deadlineErr) {
      logError(
        `[Router] deadline reached, skipping remaining providers trace=${traceId} (${errors.join('; ')})`,
      );
      throw deadlineErr;
    }

    if (!(await canAttempt(provider.name))) {
      errors.push(`${provider.name}: circuit_${getCircuitStatus(provider.name)}`);
      continue;
    }
    if (!first) first = provider.name;
    attemptedProviders.push(provider.name);

    const configured = i === chain.length - 1 ? DEGRADED_TIMEOUT_MS : baseTimeout;
    const t = Math.max(1_000, Math.min(configured, Math.floor(usableBudgetMs())));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout_${t}ms`)), t);
    const start = Date.now();
    try {
      const result = await exec(provider, controller.signal, t);
      recordSuccess(provider.name);
      logDebug(`[Router] ${provider.name} ${Date.now() - start}ms trace=${traceId}`);
      return {
        result,
        provider: provider.name,
        attemptedProviders,
        fallbackUsed: provider.name !== first,
      };
    } catch (err: unknown) {
      const timedOut = controller.signal.aborted;
      const { kind } = timedOut ? { kind: 'timeout' } : classifyError(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      recordFailure(provider.name);
      logError(
        `[Router] ${provider.name} ${kind} ${Date.now() - start}ms: ${errMsg} trace=${traceId}`,
      );
      errors.push(`${provider.name}:${kind}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}

export async function routeChat(
  params: ChatParams,
  opts: RouteOptions = {},
): Promise<ProviderRouteResult> {
  const chain = opts.chain === 'tools' ? TOOLS_CHAIN : CONV_CHAIN;
  const baseTimeout = opts.chain === 'tools' ? TOOLS_TIMEOUT_MS : CHAT_TIMEOUT_MS;
  const maxTokens = opts.chain !== 'tools' ? 250 : undefined;
  const { result, provider, attemptedProviders, fallbackUsed } = await runChain(
    chain,
    (p, signal, timeout) =>
      p.chat({ ...params, signal, timeout, ...(maxTokens ? { maxTokens } : {}) }),
    baseTimeout,
    opts.traceId,
  );
  return { ...result, provider, attemptedProviders, fallbackUsed };
}

export async function routeGenerate(
  params: GenerateParams,
  opts: RouteOptions = {},
): Promise<ProviderGenerateResult> {
  const chain = opts.chain === 'bg' ? BG_CHAIN : CONV_CHAIN;
  const { result, provider, attemptedProviders, fallbackUsed } = await runChain(
    chain,
    (p, signal, timeout) => p.generateText({ ...params, signal, timeout }),
    GEN_TIMEOUT_MS,
    opts.traceId,
  );
  return { text: result, provider, attemptedProviders, fallbackUsed };
}
