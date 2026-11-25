import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFlushMessageBuffer = vi.fn();
const mockVerifyQstashSignature = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/ai/buffer-flush', () => ({
  flushMessageBuffer: (...args: unknown[]) => mockFlushMessageBuffer(...args),
}));

vi.mock('@/lib/infra/qstash', () => ({
  verifyQstashSignature: (...args: unknown[]) => mockVerifyQstashSignature(...args),
}));

import { GET, POST } from '../flush-buffer/route';

describe('/api/cron/flush-buffer route (P0-ENG-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret-123';
    mockFlushMessageBuffer.mockResolvedValue({ flushed: 2, groups: 1, aborted: false });
  });

  it('returns 200 on GET with valid Bearer CRON_SECRET', async () => {
    const req = new NextRequest('https://www.agendra.site/api/cron/flush-buffer', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-cron-secret-123' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, flushed: 2, groups: 1, aborted: false });
  });

  it('returns 200 on POST with valid QStash signature', async () => {
    mockVerifyQstashSignature.mockResolvedValue(true);
    const req = new NextRequest('https://www.agendra.site/api/cron/flush-buffer', {
      method: 'POST',
      headers: { 'upstash-signature': 'sig-valid' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockVerifyQstashSignature).toHaveBeenCalledWith('sig-valid', '{}');
  });

  it('returns 401 on GET and POST without valid credentials', async () => {
    mockVerifyQstashSignature.mockResolvedValue(false);

    const reqGet = new NextRequest('https://www.agendra.site/api/cron/flush-buffer', {
      method: 'GET',
    });
    expect((await GET(reqGet)).status).toBe(401);

    const reqPost = new NextRequest('https://www.agendra.site/api/cron/flush-buffer', {
      method: 'POST',
      headers: { 'upstash-signature': 'bad-sig' },
      body: '{}',
    });
    expect((await POST(reqPost)).status).toBe(401);
  });
});
