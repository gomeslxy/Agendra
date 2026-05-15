import { createAdminClient } from '@/lib/supabase/admin';
import type { AILog, AITrace } from '@/lib/types/database';

/**
 * Calculates estimated cost for current Gemini models.
 * gemini-2.5-flash: $0.30/$2.50 per 1M tokens (in/out) — paid tier estimate
 * gemini-2.5-flash-lite: $0.10/$0.40 per 1M tokens (in/out)
 * Free tier: $0 — rates here used for observability estimation only.
 */
export function calculateGeminiCost(inputTokens: number, outputTokens: number, model: string): number {
  if (model.includes('flash-lite')) {
    return (inputTokens * 0.10 / 1_000_000) + (outputTokens * 0.40 / 1_000_000);
  }
  // gemini-2.5-flash
  return (inputTokens * 0.30 / 1_000_000) + (outputTokens * 2.50 / 1_000_000);
}

/**
 * Persists an AI interaction log to the database.
 * Does not block execution.
 */
export async function persistAILog(log: Omit<AILog, 'id' | 'created_at'>): Promise<void> {
  try {
    const admin = createAdminClient();
    
    // Ensure cost is calculated if tokens are provided
    const finalLog = {
      ...log,
      cost: log.cost ?? calculateGeminiCost(log.tokens_input ?? 0, log.tokens_output ?? 0, log.model)
    };

    const { error } = await admin.from('ai_logs').insert(finalLog);

    if (error) {
      console.error('[Observability] ❌ Failed to persist AI log:', error.message);
    }
  } catch (err) {
    console.error('[Observability] ❌ Exception persisting AI log:', err);
  }
}

/**
 * Persists a raw AI trace for deep observability (e.g. tool calls, completions).
 */
export async function persistAITrace(trace: Omit<AITrace, 'id' | 'created_at'>): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('ai_traces').insert(trace);

    if (error) {
      console.error('[Observability] ❌ Failed to persist AI trace:', error.message);
    }
  } catch (err) {
    console.error('[Observability] ❌ Exception persisting AI trace:', err);
  }
}

/**
 * Helper to measure latency.
 */
export function createTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}
