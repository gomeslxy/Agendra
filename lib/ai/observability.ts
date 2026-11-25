import { createAdminClient } from '@/lib/supabase/admin';
import type { AILog, AITrace } from '@/lib/types/database';
import { logError } from '@/lib/logging';

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const MODEL_PRICING: Array<{ match: string; pricing: ModelPricing }> = [
  // Cerebras (gpt-oss-120b): ~$0.35 / $0.75 per 1M tokens
  { match: 'gpt-oss-120b', pricing: { inputPerMillion: 0.35, outputPerMillion: 0.75 } },
  // SambaNova (Meta-Llama-3.3-70B-Instruct): ~$0.60 / $1.20 per 1M tokens
  { match: 'meta-llama-3.3-70b', pricing: { inputPerMillion: 0.60, outputPerMillion: 1.20 } },
  // Groq Llama 3.3 70B: ~$0.59 / $0.79 per 1M tokens
  { match: 'llama-3.3-70b', pricing: { inputPerMillion: 0.59, outputPerMillion: 0.79 } },
  // Groq Llama 3.1 8B: ~$0.05 / $0.08 per 1M tokens
  { match: 'llama', pricing: { inputPerMillion: 0.05, outputPerMillion: 0.08 } },
  { match: 'groq', pricing: { inputPerMillion: 0.05, outputPerMillion: 0.08 } },
  // Gemini 2.5 Flash Lite: $0.10 / $0.40 per 1M tokens
  { match: 'flash-lite', pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40 } },
];

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 0.30, outputPerMillion: 2.50 };

export function calculateProviderCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const normalized = (model ?? '').toLowerCase();
  const entry = MODEL_PRICING.find((p) => normalized.includes(p.match));
  const pricing = entry?.pricing ?? DEFAULT_PRICING;
  return (
    (inputTokens * pricing.inputPerMillion) / 1_000_000 +
    (outputTokens * pricing.outputPerMillion) / 1_000_000
  );
}

/** @deprecated Use calculateProviderCost */
export const calculateGeminiCost = calculateProviderCost;

export async function persistAILog(log: Omit<AILog, 'id' | 'created_at'>): Promise<void> {
  try {
    const admin = createAdminClient();
    const finalLog = {
      ...log,
      cost: log.cost ?? calculateProviderCost(log.tokens_input ?? 0, log.tokens_output ?? 0, log.model),
    };

    const { error } = await admin.from('ai_logs').insert(finalLog);
    if (error) {
      logError('[Observability] Failed to persist AI log:', error.message);
    }
  } catch (err) {
    logError('[Observability] Exception persisting AI log:', err);
  }
}

export async function persistAITrace(trace: Omit<AITrace, 'id' | 'created_at'>): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('ai_traces').insert(trace);
    if (error) {
      logError('[Observability] Failed to persist AI trace:', error.message);
    }
  } catch (err) {
    logError('[Observability] Exception persisting AI trace:', err);
  }
}

export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
