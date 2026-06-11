// lib/ai/__tests__/lock-requeue.test.ts
//
// Lock-contention requeue: quando uma mensagem chega enquanto um turno do mesmo
// lead ainda está em andamento (is_processing=true, lock fresco), o engine deve
// parquear o turno no message_buffer durável (re-entregue pelo drain de 1min)
// em vez de descartar a mensagem — antes o lead ficava sem resposta.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { handleIncomingMessage } from '../engine';

/** Chainable query mock: every method returns the chain; awaiting it (or any
 *  terminal method) resolves to `result`. */
function chainable(result: any): any {
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
      }
      return (..._args: any[]) => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

describe('handleIncomingMessage — lock contention requeue', () => {
  const lockedLead = {
    id: 'lead-1',
    company_id: 'company-1',
    phone: '5511999999999',
    name: 'Carlos',
    is_processing: true, // another worker holds the lock
    processing_started_at: new Date().toISOString(), // fresh — not reclaimable
    last_message_at: new Date(Date.now() - 60_000).toISOString(), // passes 1s rate limit
    human_takeover_until: null,
    control_mode: 'auto',
    lead_memory: {},
  };

  let bufferUpserts: any[];
  let processedDeletes: number;
  let processedErrorUpdates: any[];

  function buildAdmin(opts: { upsertError?: any } = {}) {
    bufferUpserts = [];
    processedDeletes = 0;
    processedErrorUpdates = [];

    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case 'processed_messages':
            return {
              insert: vi.fn().mockResolvedValue({ error: null }), // dedup claim wins
              delete: vi.fn(() => {
                processedDeletes++;
                return chainable({ error: null });
              }),
              update: vi.fn((payload: any) => {
                processedErrorUpdates.push(payload);
                return chainable({ error: null });
              }),
            };
          case 'companies':
            return chainable({
              data: { id: 'company-1', plan_type: 'pro', persona_config: {} },
              error: null,
            });
          case 'services':
            return chainable({ data: [], error: null });
          case 'leads':
            return {
              select: vi.fn(() => chainable({ data: lockedLead, error: null })),
              // Both the lock attempt and the stale reclaim fail (fresh lock).
              update: vi.fn(() => chainable({ data: null, error: null })),
            };
          case 'message_buffer':
            return {
              upsert: vi.fn((payload: any) => {
                bufferUpserts.push(payload);
                return Promise.resolve({ error: opts.upsertError ?? null });
              }),
            };
          case 'messages':
            return { insert: vi.fn(() => chainable({ error: null })) };
          default:
            return chainable({ data: null, error: null });
        }
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parks the turn in message_buffer and frees the dedup claim instead of dropping it', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin());

    const outcome = await handleIncomingMessage(
      'company-1', '5511999999999', 'Carlos',
      'e qual o preço?', 'wamid.MSG1', undefined,
      { pre_persisted_ids: ['pre-1'] },
    );

    expect(outcome).toBe('requeued');
    expect(bufferUpserts).toHaveLength(1);
    const row = bufferUpserts[0];
    expect(row.provider_message_id).toBe('wamid.MSG1');
    expect(row.company_id).toBe('company-1');
    expect(row.body).toBe('e qual o preço?');
    expect(row.flushed).toBe(false);
    expect(row.metadata.requeue_count).toBe(1);
    // Pre-saved inbox IDs must survive the requeue (replay skips duplicate insert).
    expect(row.metadata.pre_persisted_ids).toEqual(['pre-1']);
    // Dedup claim released so the redelivery is not skipped as a duplicate.
    expect(processedDeletes).toBe(1);
    expect(processedErrorUpdates).toHaveLength(0);
  });

  it('applies exponential backoff to flush_after on later attempts', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin());

    const before = Date.now();
    const outcome = await handleIncomingMessage(
      'company-1', '5511999999999', 'Carlos',
      'oi?', 'wamid.MSG2', undefined,
      { requeue_count: 3 }, // 4th attempt → 5s * 2^3 = 40s
    );

    expect(outcome).toBe('requeued');
    const delay = new Date(bufferUpserts[0].flush_after).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(39_000);
    expect(delay).toBeLessThanOrEqual(41_500);
    expect(bufferUpserts[0].metadata.requeue_count).toBe(4);
  });

  it('falls back to the error path once the requeue budget is exhausted', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin());

    const outcome = await handleIncomingMessage(
      'company-1', '5511999999999', 'Carlos',
      'alo', 'wamid.MSG3', undefined,
      { requeue_count: 8 }, // MAX_LOCK_REQUEUES reached
    );

    expect(outcome).toBeUndefined();
    expect(bufferUpserts).toHaveLength(0);
    expect(processedDeletes).toBe(0);
    expect(processedErrorUpdates).toHaveLength(1);
    expect(processedErrorUpdates[0].status).toBe('error');
  });

  it('keeps the dedup claim when the requeue insert itself fails (no silent loss)', async () => {
    (createAdminClient as any).mockReturnValue(
      buildAdmin({ upsertError: { message: 'db down' } }),
    );

    const outcome = await handleIncomingMessage(
      'company-1', '5511999999999', 'Carlos',
      'alo', 'wamid.MSG4', undefined, {},
    );

    expect(outcome).toBeUndefined();
    expect(processedDeletes).toBe(0); // claim NOT released
    expect(processedErrorUpdates).toHaveLength(1); // surfaced as error, visible
  });
});
