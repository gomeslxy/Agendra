// lib/ai/observability.ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { AILog } from '@/lib/types/database';

/**
 * Persists an AI interaction log to the database.
 * Does not block execution (async fire-and-forget recommended).
 */
export async function persistAILog(log: Omit<AILog, 'id' | 'created_at'>): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from('ai_logs').insert(log);

  if (error) {
    console.error('[Observability] ❌ Failed to persist AI log:', error.message);
  }
}

/**
 * Helper to measure latency.
 */
export function createTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}
