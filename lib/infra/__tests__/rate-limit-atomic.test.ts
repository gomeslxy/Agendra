import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRateLimitIncr = vi.fn();

vi.mock('@/lib/infra/redis', () => ({
  isAvailable: () => true,
  redis: {
    rateLimitIncr: (...args: unknown[]) => mockRateLimitIncr(...args),
  },
}));

import { checkRateLimitAsync } from '@/lib/rate-limit';

describe('Atomic Redis rate limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls atomic Lua rateLimitIncr with rl: prefix and windowMs and enforces maxRequests', async () => {
    mockRateLimitIncr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    expect(await checkRateLimitAsync('signup:1.2.3.4', 2, 60_000)).toBe(true);
    expect(await checkRateLimitAsync('signup:1.2.3.4', 2, 60_000)).toBe(true);
    expect(await checkRateLimitAsync('signup:1.2.3.4', 2, 60_000)).toBe(false);

    expect(mockRateLimitIncr).toHaveBeenCalledTimes(3);
    expect(mockRateLimitIncr).toHaveBeenCalledWith('rl:signup:1.2.3.4', 60_000);
  });
});
