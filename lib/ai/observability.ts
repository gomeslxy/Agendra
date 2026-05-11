import { createAdminClient } from '@/lib/supabase/admin';
import type { AILog, AITrace } from '@/lib/types/database';

/**
 * Persists an AI interaction log to the database.
 * Does not block execution (async fire-and-forget recommended).
 */
export async function persistAILog(log: Omit<AILog, 'id' | 'created_at'>): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('ai_logs').insert(log);

    if (error) {
      console.error('[Observability] ❌ Failed to persist AI log:', error.message);
    }
  } catch (err) {
    console.error('[Observability] ❌ Exception persisting AI log:', err);
  }
}

/**
 * Persists a raw AI trace for deep observability (e.g. tool calls, completions).
 * Does not block execution.
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
