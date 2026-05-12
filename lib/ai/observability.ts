import { createAdminClient } from '@/lib/supabase/admin';
import type { AILog, AITrace } from '@/lib/types/database';

/**
 * Calculates estimated cost for Gemini 1.5 Flash.
 */
export function calculateGeminiCost(inputTokens: number, outputTokens: number, model: string): number {
  // Approximate pricing for Gemini 1.5 Flash
  // Input: $0.075 / 1M tokens
  // Output: $0.30 / 1M tokens
  const is8b = model.includes('8b');
  const inputRate = is8b ? 0.0375 / 1_000_000 : 0.075 / 1_000_000;
  const outputRate = is8b ? 0.15 / 1_000_000 : 0.30 / 1_000_000;

  return (inputTokens * inputRate) + (outputTokens * outputRate);
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
