import { CerebrasAdapter } from './cerebras-adapter';
import { GroqAdapter } from './groq-adapter';
import { SambaNovaAdapter } from './sambanova-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { canAttempt, recordSuccess, recordFailure, getCircuitStatus } from './circuit-breaker';
import type {
  AIProviderAdapter, ChatParams, GenerateParams,
  ProviderName, ProviderRouteResult, ProviderGenerateResult, RouteOptions,
} from './types';

const CHAT_TIMEOUT_MS = 12_000;
const GEN_TIMEOUT_MS = 12_000;
const DEGRADED_TIMEOUT_MS = 25_000;

const cerebras = new CerebrasAdapter();
const groq = new GroqAdapter();
const sambanova = new SambaNovaAdapter();
const gemini = new GeminiAdapter();

const CONV_CHAIN: AIProviderAdapter[] = [cerebras, groq, gemini];
const TOOLS_CHAIN: AIProviderAdapter[] = [sambanova, cerebras, groq, gemini];
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
  exec: (p: AIProviderAdapter, signal: AbortSignal) => Promise<T>,
  baseTimeout: number,
  traceId?: string
): Promise<{ result: T; provider: ProviderName; fallbackUsed: boolean }> {
  const errors: string[] = [];
  let first: ProviderName | null = null;

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    if (!canAttempt(provider.name)) {
      errors.push(`${provider.name}: circuit_${getCircuitStatus(provider.name)}`);
      continue;
    }
    if (!first) first = provider.name;
    const t = i === chain.length - 1 ? DEGRADED_TIMEOUT_MS : baseTimeout;
    const controller = new AbortController();
    const start = Date.now();
    try {
      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => { controller.abort(); rej(new Error(`timeout_${t}ms`)); }, t));
      const result = await Promise.race([exec(provider, controller.signal), timeout]);
      recordSuccess(provider.name);
      console.log(`[Router] ✅ ${provider.name} ${Date.now() - start}ms trace=${traceId}`);
      return { result, provider: provider.name, fallbackUsed: provider.name !== first };
    } catch (err: any) {
      const { kind } = classifyError(err);
      recordFailure(provider.name);
      console.warn(`[Router] ❌ ${provider.name} ${kind} ${Date.now() - start}ms: ${err.message} trace=${traceId}`);
      errors.push(`${provider.name}:${kind}`);
    }
  }
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}

export async function routeChat(
  params: ChatParams,
  opts: RouteOptions = {}
): Promise<ProviderRouteResult> {
  const chain = opts.chain === 'tools' ? TOOLS_CHAIN : CONV_CHAIN;
  const { result, provider, fallbackUsed } = await runChain(
    chain, (p, signal) => p.chat({ ...params, signal }), CHAT_TIMEOUT_MS, opts.traceId
  );
  return { ...result, provider, fallbackUsed };
}

export async function routeGenerate(
  params: GenerateParams,
  opts: RouteOptions = {}
): Promise<ProviderGenerateResult> {
  const chain = opts.chain === 'bg' ? BG_CHAIN : CONV_CHAIN;
  const { result, provider, fallbackUsed } = await runChain(
    chain, (p) => p.generateText(params), GEN_TIMEOUT_MS, opts.traceId
  );
  return { text: result, provider, fallbackUsed };
}
