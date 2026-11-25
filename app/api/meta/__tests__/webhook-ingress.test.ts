import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const mockResolveChannelRoute = vi.fn();
const mockClaimMessage = vi.fn();
const mockBufferAndQueueMessage = vi.fn();
const mockCheckRateLimitAsync = vi.fn();

vi.mock('@/lib/channels/channel-cache', () => ({
  resolveChannelRoute: (...args: unknown[]) => mockResolveChannelRoute(...args),
}));

vi.mock('@/lib/ai/debounce', () => ({
  claimMessage: (...args: unknown[]) => mockClaimMessage(...args),
  bufferAndQueueMessage: (...args: unknown[]) => mockBufferAndQueueMessage(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: (...args: unknown[]) => mockCheckRateLimitAsync(...args),
}));

vi.mock('@/lib/channels/registry', () => ({
  getAdapter: () => ({
    parseWebhookPayload: async () => ({
      channelProviderId: 'ig-page-1',
      messages: [
        {
          providerMessageId: 'mid.123',
          senderIdentifier: 'ig-user-1',
          senderName: 'Lead IG',
          type: 'text',
          text: 'Olá!',
        },
      ],
      statusUpdates: [],
    }),
  }),
}));

import { handleMetaWebhookPost } from '@/lib/channels/webhook-ingress';

describe('Unified Meta/Instagram Webhook Ingress', () => {
  const prevWaSecret = process.env.WHATSAPP_APP_SECRET;
  const prevIgSecret = process.env.INSTAGRAM_APP_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = 'wa-secret-123';
    process.env.INSTAGRAM_APP_SECRET = 'ig-secret-123';
    mockCheckRateLimitAsync.mockResolvedValue(true);
    mockResolveChannelRoute.mockResolvedValue({
      id: 'ch-1',
      companyId: 'co-1',
      provider: 'instagram',
      providerId: 'ig-page-1',
      status: 'active',
      subscriptionStatus: 'active',
      meta: {},
      accessToken: 'tok-1',
    });
  });

  afterEach(() => {
    if (prevWaSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = prevWaSecret;
    if (prevIgSecret === undefined) delete process.env.INSTAGRAM_APP_SECRET;
    else process.env.INSTAGRAM_APP_SECRET = prevIgSecret;
  });

  it('returns 401 (never 500) on non-hex 64-char x-hub-signature-256', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const req = new NextRequest('http://localhost/api/meta/webhook', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': `sha256=${'z'.repeat(64)}`,
      },
      body,
    });

    const res = await handleMetaWebhookPost(req, {
      appSecretEnv: 'WHATSAPP_APP_SECRET',
      label: 'Meta Webhook',
    });

    expect(res.status).toBe(401);
  });

  it('deduplicates repeated messages and enqueues valid Instagram DMs before returning 200', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });
    const sig = crypto
      .createHmac('sha256', 'ig-secret-123')
      .update(body, 'utf8')
      .digest('hex');

    mockClaimMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const req1 = new NextRequest('http://localhost/api/webhooks/instagram', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${sig}` },
      body,
    });
    const req2 = new NextRequest('http://localhost/api/webhooks/instagram', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${sig}` },
      body,
    });

    const res1 = await handleMetaWebhookPost(req1, {
      appSecretEnv: 'INSTAGRAM_APP_SECRET',
      providerOverride: 'instagram',
      label: 'Instagram Webhook',
    });
    const res2 = await handleMetaWebhookPost(req2, {
      appSecretEnv: 'INSTAGRAM_APP_SECRET',
      providerOverride: 'instagram',
      label: 'Instagram Webhook',
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockBufferAndQueueMessage).toHaveBeenCalledTimes(1);
    expect(mockBufferAndQueueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co-1',
        providerMessageId: 'mid.123',
      }),
    );
  });
});
