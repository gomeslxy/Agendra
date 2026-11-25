import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    }),
    auth: {
      admin: {
        updateUserById: async () => ({ data: { user: { user_metadata: {} } }, error: null }),
      },
    },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: async () => true,
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: async () => {},
}));

import { hashOtpCode } from '../otp';
import { POST as verifyOtpPost } from '@/app/api/auth/verify-otp/route';

describe('OTP SHA-256 hashing & atomic brute-force lockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes OTP deterministically without exposing plaintext code', () => {
    const h1 = hashOtpCode('123456');
    const h2 = hashOtpCode(' 123456 ');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain('123456');
  });

  it('passes code_hash to verify_otp_atomic and returns 429 on max_attempts', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockRpc
      .mockResolvedValueOnce({ data: null, error: null }) // cleanup_expired_otps
      .mockResolvedValueOnce({
        data: [{ valid: false, reason: 'max_attempts' }],
        error: null,
      });

    const req = new NextRequest('http://localhost/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', code: '000000' }),
    });

    const res = await verifyOtpPost(req);
    expect(res.status).toBe(429);
    expect(mockRpc).toHaveBeenCalledWith('verify_otp_atomic', {
      p_email: 'user@example.com',
      p_purpose: 'signup',
      p_code_hash: hashOtpCode('000000'),
      p_max_attempts: 5,
    });
  });
});
