import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHandleIncomingMessage = vi.fn();
const mockRouteMedia = vi.fn();
const mockGetCompanyUsage = vi.fn();

vi.mock('@/lib/ai/engine', () => ({
  handleIncomingMessage: (...args: unknown[]) => mockHandleIncomingMessage(...args),
}));

vi.mock('@/lib/ai/media-router', () => ({
  routeMedia: (...args: unknown[]) => mockRouteMedia(...args),
}));

vi.mock('@/lib/billing/limits', () => ({
  getCompanyUsage: (...args: unknown[]) => mockGetCompanyUsage(...args),
}));

vi.mock('@/lib/infra/redis', () => ({
  redis: {
    claimFlushGen: vi.fn(),
    releaseFlushGen: vi.fn().mockResolvedValue(undefined),
    lrange: vi.fn().mockResolvedValue([]),
    trimPrePersistedIds: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { flushBuffer } from '../debounce';
import { redis } from '@/lib/infra/redis';
import { createAdminClient } from '@/lib/supabase/admin';

describe('flushBuffer — requeue preservation, CAS claim & media pre-save update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompanyUsage.mockResolvedValue({
      planType: 'pro',
      isLimitReached: false,
      limits: { hasWatermark: false, hasRAG: true, hasAnalytics: true },
    });
  });

  it('preserves items[0] unflushed when handleIncomingMessage returns requeued in a multi-msg batch', async () => {
    (redis.claimFlushGen as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockHandleIncomingMessage.mockResolvedValue('requeued');

    const flushedUpdates: Array<{ ids: string[]; payload: Record<string, unknown> }> = [];
    const rows = [
      {
        provider_message_id: 'wamid.1',
        company_id: 'comp-1',
        lead_phone: '5511999999999',
        lead_name: 'Maria',
        body: 'Oi',
        msg_type: 'text',
        metadata: { attempt_count: 1 },
        flush_after: new Date().toISOString(),
        flushed: false,
      },
      {
        provider_message_id: 'wamid.2',
        company_id: 'comp-1',
        lead_phone: '5511999999999',
        lead_name: 'Maria',
        body: 'Tudo bem?',
        msg_type: 'text',
        metadata: { attempt_count: 1 },
        flush_after: new Date().toISOString(),
        flushed: false,
      },
    ];

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'message_buffer') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => Promise.resolve({ data: rows, error: null }),
                  }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              in: (_col: string, ids: string[]) => {
                flushedUpdates.push({ ids, payload });
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        return {};
      }),
    });

    await flushBuffer({
      companyId: 'comp-1',
      leadPhone: '5511999999999',
      leadName: 'Maria',
      gen: 'gen-abc12345',
    });

    // Uses items[0] as representative message ID
    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      'comp-1',
      '5511999999999',
      'Maria',
      expect.stringContaining('Oi'),
      'wamid.1',
      expect.anything(),
      expect.objectContaining({ debounce_batch_size: 2 }),
    );

    // Only items[1] is marked flushed; items[0] stays unflushed for requeue retry
    expect(flushedUpdates).toHaveLength(1);
    expect(flushedUpdates[0].ids).toEqual(['wamid.2']);
    expect(flushedUpdates[0].payload).toEqual({ flushed: true });
    expect(redis.releaseFlushGen).toHaveBeenCalledWith('ch:bufgen:comp-1:5511999999999', 'gen-abc12345');
  });

  it('exits immediately when claimFlushGen returns false (concurrent flusher)', async () => {
    (redis.claimFlushGen as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const mockFrom = vi.fn();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    await flushBuffer({
      companyId: 'comp-1',
      leadPhone: '5511999999999',
      leadName: 'Maria',
      gen: 'gen-stale123',
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });

  it('updates pre-saved inbox message content after audio transcription via routeMedia', async () => {
    (redis.claimFlushGen as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockHandleIncomingMessage.mockResolvedValue(undefined);
    mockRouteMedia.mockResolvedValue({
      body: '[ÁUDIO TRANSCRITO] Quero agendar corte amanhã',
      metadata: { is_audio: true, transcribe_provider: 'groq' },
    });

    const messageUpdates: Array<{ payload: Record<string, unknown>; id: string }> = [];
    const rows = [
      {
        provider_message_id: 'wamid.AUD1',
        company_id: 'comp-1',
        lead_phone: '5511999999999',
        lead_name: 'Maria',
        body: '',
        msg_type: 'audio',
        metadata: {
          channelId: 'chan-1',
          mediaId: 'media-123',
          pre_message_id: 'pre-msg-1',
        },
        flush_after: new Date().toISOString(),
        flushed: false,
      },
    ];

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'message_buffer') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => Promise.resolve({ data: rows, error: null }),
                  }),
                }),
              }),
            }),
            update: () => ({
              in: () => Promise.resolve({ error: null }),
            }),
          };
        }
        if (table === 'channels') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id: 'chan-1', access_token: 'tok-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'messages') {
          return {
            update: (payload: Record<string, unknown>) => ({
              eq: (_c: string, id: string) => ({
                eq: () => {
                  messageUpdates.push({ payload, id });
                  return Promise.resolve({ error: null });
                },
              }),
            }),
          };
        }
        return {};
      }),
    });

    await flushBuffer({
      companyId: 'comp-1',
      leadPhone: '5511999999999',
      leadName: 'Maria',
      gen: 'gen-aud12345',
    });

    expect(messageUpdates).toHaveLength(1);
    expect(messageUpdates[0].id).toBe('pre-msg-1');
    expect(messageUpdates[0].payload.content).toBe('[ÁUDIO TRANSCRITO] Quero agendar corte amanhã');
  });
});
