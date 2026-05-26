// lib/infra/__tests__/redis-dedup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock process env variables
process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { redis, isAvailable } from '../redis';
import { claimMessage } from '@/lib/ai/debounce';
import { createAdminClient } from '@/lib/supabase/admin';

describe('Redis Deduplication and Error Classification (Task 2)', () => {
  const globalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('isAvailable returns true when environment variables are set', () => {
    expect(isAvailable()).toBe(true);
  });

  it('setNX returns true when key does not exist (success)', async () => {
    // Mock successful fetch returning "OK" from Upstash
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'OK' }),
    });

    const result = await redis.setNX('test-key', '1', 60);
    expect(result).toBe(true);
  });

  it('setNX returns false when key already exists (NX fails)', async () => {
    // Upstash REST returns { result: null } when NX condition fails on existing key
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: null }),
    });

    const result = await redis.setNX('existing-key', '1', 60);
    expect(result).toBe(false);
  });

  it('setNX returns null when Redis server is down (connection error)', async () => {
    // Mock connection rejection / timeout / 500 error
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await redis.setNX('any-key', '1', 60);
    expect(result).toBeNull();
  });

  it('claimMessage returns true on first claim', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'OK' }),
    });

    const result = await claimMessage('msg-unique');
    expect(result).toBe(true);
  });

  it('claimMessage returns false on duplicate message', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: null }), // NX fails
    });

    const result = await claimMessage('msg-duplicate');
    expect(result).toBe(false);
  });

  it('claimMessage falls back to PostgreSQL when Redis is down', async () => {
    // 1. Redis setNX returns null (connection down)
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
    });

    // 2. Mock PG database insert success
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await claimMessage('msg-offline-ok');
    expect(result).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('dedup_keys');
    expect(mockInsert).toHaveBeenCalledWith({ provider_message_id: 'msg-offline-ok' });
  });

  it('claimMessage returns false when Redis is down and PG unique constraint fails (duplicate)', async () => {
    // 1. Redis setNX returns null
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
    });

    // 2. Mock PG unique constraint error (code 23505)
    const mockInsert = vi.fn().mockResolvedValue({ error: { code: '23505' } });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await claimMessage('msg-offline-dup');
    expect(result).toBe(false);
  });
});
