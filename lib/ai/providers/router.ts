import { GeminiAdapter } from './gemini-adapter';
import { GroqAdapter } from './groq-adapter';
import { canAttempt, recordSuccess, recordFailure, getCircuitStatus } from './circuit-breaker';
import type {
  ChatParams,
  GenerateParams,
  ProviderName,
  ProviderRouteResult,
  ProviderGenerateResult,
} from './types';

const PROVIDER_TIMEOUT_MS = 15_000;

// Singleton adapters — module-level, reused across warm invocations
const groq = new GroqAdapter();
const gemini = new GeminiAdapter();

// Priority: Groq first, Gemini fallback
const CHAT_CHAIN = [groq, gemini];
const GENERATE_CHAIN = [groq, gemini];

function classifyError(err: any): { retryable: boolean; kind: string } {
  const status: number = err?.status ?? err?.statusCode ?? err?.error?.status ?? 0;
  const msg = String(err?.message ?? err ?? '').toLowerCase();

  if (status === 401 || status === 403) return { retryable: false, kind: 'auth_error' };
  if (status === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('429'))
    return { retryable: true, kind: 'rate_limit' };
  if (
    status >= 500 ||
    msg.includes('overload') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('timeout')
  )
    return { retryable: true, kind: 'server_error' };

  return { retryable: true, kind: 'unknown' };
}

export async function routeChat(
  params: ChatParams,
  traceId?: string
): Promise<ProviderRouteResult> {
  const errors: string[] = [];
  let firstProvider: ProviderName | null = null;

  for (const provider of CHAT_CHAIN) {
    if (!canAttempt(provider.name)) {
      const status = getCircuitStatus(provider.name);
      console.warn(`[Router] Skip ${provider.name} — circuit ${status} | trace=${traceId}`);
      errors.push(`${provider.name}: circuit_${status}`);
      continue;
    }

    const start = Date.now();
    if (!firstProvider) firstProvider = provider.name;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider timeout')), PROVIDER_TIMEOUT_MS)
      );

      const result = await Promise.race([provider.chat(params), timeout]);
      const latency = Date.now() - start;

      recordSuccess(provider.name);
      console.log(
        `[Router] ✅ ${provider.name} chat OK ${latency}ms model=${result.modelUsed} tools=${result.toolsCalled.length} | trace=${traceId}`
      );

      return {
        ...result,
        provider: provider.name,
        fallbackUsed: provider.name !== firstProvider,
      };
    } catch (err: any) {
      const { kind } = classifyError(err);
      const latency = Date.now() - start;

      recordFailure(provider.name);
      console.warn(
        `[Router] ❌ ${provider.name} chat FAIL (${kind}, ${latency}ms): ${err.message} | trace=${traceId}`
      );
      errors.push(`${provider.name}: ${kind} — ${err.message?.substring(0, 120)}`);
    }
  }

  const summary = errors.join('; ');
  console.error(`[Router] 🔴 All providers failed (chat) | trace=${traceId} | ${summary}`);
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${summary}`);
}

export async function routeGenerate(
  params: GenerateParams,
  traceId?: string
): Promise<ProviderGenerateResult> {
  const errors: string[] = [];
  let firstProvider: ProviderName | null = null;

  for (const provider of GENERATE_CHAIN) {
    if (!canAttempt(provider.name)) {
      const status = getCircuitStatus(provider.name);
      errors.push(`${provider.name}: circuit_${status}`);
      continue;
    }

    const start = Date.now();
    if (!firstProvider) firstProvider = provider.name;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider timeout')), PROVIDER_TIMEOUT_MS)
      );

      const text = await Promise.race([provider.generateText(params), timeout]);
      const latency = Date.now() - start;

      recordSuccess(provider.name);
      console.log(`[Router] ✅ ${provider.name} generate OK ${latency}ms | trace=${traceId}`);

      return {
        text,
        provider: provider.name,
        fallbackUsed: provider.name !== firstProvider,
      };
    } catch (err: any) {
      const { kind } = classifyError(err);
      const latency = Date.now() - start;

      recordFailure(provider.name);
      console.warn(
        `[Router] ❌ ${provider.name} generate FAIL (${kind}, ${latency}ms): ${err.message} | trace=${traceId}`
      );
      errors.push(`${provider.name}: ${kind} — ${err.message?.substring(0, 120)}`);
    }
  }

  const summary = errors.join('; ');
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${summary}`);
}
