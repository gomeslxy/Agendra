import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/infra/qstash', () => ({
  qstashEnabled: vi.fn().mockReturnValue(true),
  client: vi.fn().mockReturnValue({
    publishJSON: vi.fn().mockResolvedValue(true),
  }),
  publicBaseUrl: vi.fn().mockReturnValue('https://www.agendra.site'),
}));

vi.mock('@/lib/channels/send', () => ({
  sendChannelMessage: vi.fn().mockResolvedValue({ ok: true }),
  sendChannelTyping: vi.fn().mockResolvedValue(undefined),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { qstashEnabled, client as qstashClient } from '@/lib/infra/qstash';
import { sendChannelTyping } from '@/lib/channels/send';
import { handleIncomingMessage } from '../engine';

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

describe('handleIncomingMessage — typing loop & qstash requeue', () => {
  const lockedLead = {
    id: 'lead-1',
    company_id: 'company-1',
    phone: '5511999999999',
    name: 'Carlos',
    is_processing: true,
    processing_started_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 60_000).toISOString(),
    human_takeover_until: null,
    control_mode: 'auto',
    lead_memory: { timeline: [] },
  };

  const unlockedLead = {
    ...lockedLead,
    is_processing: false,
  };

  let bufferUpserts: any[];

  function buildAdmin(locked: boolean) {
    bufferUpserts = [];
    return {
      from: vi.fn((table: string) => {
        switch (table) {
          case 'processed_messages':
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
              delete: vi.fn(() => chainable({ error: null })),
              update: vi.fn(() => chainable({ error: null })),
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
              select: vi.fn(() => chainable({ data: locked ? lockedLead : unlockedLead, error: null })),
              update: vi.fn(() => chainable({ data: locked ? null : unlockedLead, error: null })),
            };
          case 'message_buffer':
            return {
              upsert: vi.fn((payload: any) => {
                bufferUpserts.push(payload);
                return Promise.resolve({ error: null });
              }),
            };
          case 'messages':
            return {
              insert: vi.fn(() => chainable({ error: null })),
              select: vi.fn(() => chainable({ data: [], count: 0, error: null })),
            };
          default:
            return chainable({ data: null, error: null });
        }
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules QStash flush-buffer job on lock contention requeue', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin(true)); // locked lead

    const outcome = await handleIncomingMessage(
      'company-1', '5511999999999', 'Carlos',
      'e qual o preço?', 'wamid.MSG1', undefined,
      { pre_persisted_ids: ['pre-1'] },
    );

    expect(outcome).toBe('requeued');
    expect(qstashEnabled).toHaveBeenCalled();
    expect(qstashClient).toHaveBeenCalled();
    
    const mockQStashClient = qstashClient();
    expect(mockQStashClient.publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.agendra.site/api/cron/flush-buffer',
        delay: 5, // LOCK_REQUEUE_BASE_DELAY_MS is 5s
        headers: {
          Authorization: expect.stringContaining('Bearer'),
        },
      })
    );
  });

  it('runs typing loop during AI processing and cleans up interval on finish', async () => {
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    
    let intervalCallback: any = null;
    let cleared = false;
    
    global.setInterval = vi.fn((cb, ms) => {
      intervalCallback = cb;
      return 123 as any;
    }) as any;
    
    global.clearInterval = vi.fn((id) => {
      if (id === 123) cleared = true;
    }) as any;

    (createAdminClient as any).mockReturnValue(buildAdmin(false)); // unlocked lead
    
    const router = await import('../providers/router');
    const mockRouteChat = vi.spyOn(router, 'routeChat').mockImplementation(async () => {
      // Simulate interval tick while AI is generating
      if (intervalCallback) intervalCallback();
      return {
        text: 'Olá Carlos, tudo bem?',
        provider: 'cerebras',
        fallbackUsed: false,
        tokensInput: 10,
        tokensOutput: 10,
        modelUsed: 'gpt-oss-120b',
        status: 'success',
        heat_score: 50,
      } as any;
    });

    await handleIncomingMessage(
      'company-1', '5511999999999', 'Carlos',
      'olá', 'wamid.MSG2', undefined, {}
    );

    // Initial check: typing indicator should be sent immediately
    expect(sendChannelTyping).toHaveBeenCalledWith('5511999999999', 'company-1', 'wamid.MSG2');
    
    // Interval mock checks
    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 4000);
    expect(global.clearInterval).toHaveBeenCalledWith(123);
    expect(cleared).toBe(true);

    // Revert globals
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    mockRouteChat.mockRestore();
  });
});
