// lib/channels/__tests__/privilege-boundary.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Mock logger to avoid flooding console in tests
vi.mock('@/lib/logging', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logDebug: vi.fn(),
  isDebug: () => false,
}));

// Mock adapter registry
vi.mock('../registry', () => ({
  getAdapter: vi.fn(() => ({
    sendText: vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-123' }),
    sendMedia: vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-123' }),
  })),
}));

import { sendChannelMessage } from '../send';

describe('Channel Privilege Boundary (B-06)', () => {
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();

  // Fluent query builder factory
  const createMockQueryBuilder = (resultData: any, resultError: any = null) => {
    const chain: any = {
      eq: () => chain,
      neq: () => chain,
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: resultData, error: resultError }),
      maybeSingle: () => Promise.resolve({ data: resultData, error: resultError }),
      then: (resolve: any) => resolve({ data: resultData, error: resultError }),
    };
    return chain;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
      rpc: mockRpc,
    });
  });

  it('fails to send when no active channels are found for the company', async () => {
    // 1. Lead check returns no lead/channel
    const leadQuery = createMockQueryBuilder(null);
    mockFrom.mockReturnValueOnce(leadQuery);

    // 2. Channels check returns empty array
    const channelsQuery = createMockQueryBuilder([]);
    mockFrom.mockReturnValueOnce(channelsQuery);

    await expect(
      sendChannelMessage('5511999999999', 'Olá, tudo bem?', 'company-123')
    ).rejects.toThrow('Nenhum canal ativo configurado para a empresa company-123');
  });

  it('resolves active channel and retrieves access token via RPC correctly', async () => {
    // 1. Lead lookup returns no specific channel
    const leadQuery = createMockQueryBuilder(null);
    mockFrom.mockReturnValueOnce(leadQuery);

    // 2. Active channels lookup returns one active WhatsApp channel
    const mockChannel = {
      id: 'channel-uuid-456',
      company_id: 'company-123',
      provider: 'whatsapp',
      provider_id: 'phone-id-789',
      access_token: 'legacy-token',
      status: 'active',
      meta: {},
    };
    const channelsQuery = createMockQueryBuilder([mockChannel]);
    mockFrom.mockReturnValueOnce(channelsQuery);

    // 3. RPC returns a decrypted token from Vault
    mockRpc.mockResolvedValue({ data: 'vault-decrypted-token', error: null });

    const result = await sendChannelMessage('5511999999999', 'Olá', 'company-123');
    
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('channel_get_access_token', {
      p_channel_id: 'channel-uuid-456',
    });
  });

  it('strictly isolates tenant boundary if lead matches channel but channel belongs to another company', async () => {
    // 1. Lead lookup matches a preferred channel_id
    const leadQuery = createMockQueryBuilder({
      channel: 'whatsapp',
      channel_id: 'malicious-cross-tenant-channel',
    });
    mockFrom.mockReturnValueOnce(leadQuery);

    // 2. Channel lookup for that channel_id returns null (unauthorized/mismatch)
    const channelDetailQuery = createMockQueryBuilder(null);
    mockFrom.mockReturnValueOnce(channelDetailQuery);

    // 3. Fallback active channels lookup returns empty list
    const activeChannelsQuery = createMockQueryBuilder([]);
    mockFrom.mockReturnValueOnce(activeChannelsQuery);

    await expect(
      sendChannelMessage('5511999999999', 'Olá', 'company-123')
    ).rejects.toThrow('Nenhum canal ativo configurado para a empresa company-123');
  });
});
