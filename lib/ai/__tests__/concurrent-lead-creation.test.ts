import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Lead } from '@/lib/types/database';
import { acquireOrCreateLeadLock } from '../turn-lock';

describe('acquireOrCreateLeadLock — concurrent lead creation (P0-ENG-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows exactly 1 winner and forces the loser into lock contention via RPC', async () => {
    const baseLead = {
      id: 'lead-race-1',
      company_id: 'comp-1',
      phone: '5511988887777',
      name: 'João',
      is_processing: true,
      last_message_at: null,
      control_mode: 'autonomous',
    } as unknown as Lead;

    let callCount = 0;
    const mockAdmin = {
      rpc: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            data: [{ acquired: true, lead_row: baseLead, previous_last_message_at: null }],
            error: null,
          };
        }
        return {
          data: [{ acquired: false, lead_row: baseLead, previous_last_message_at: baseLead.created_at }],
          error: null,
        };
      }),
    };

    const [res1, res2] = await Promise.all([
      acquireOrCreateLeadLock(mockAdmin as never, {
        companyId: 'comp-1',
        phone: '5511988887777',
        senderName: 'João',
        channel: 'whatsapp',
        channelId: null,
      }),
      acquireOrCreateLeadLock(mockAdmin as never, {
        companyId: 'comp-1',
        phone: '5511988887777',
        senderName: 'João',
        channel: 'whatsapp',
        channelId: null,
      }),
    ]);

    expect([res1.acquired, res2.acquired].filter(Boolean)).toHaveLength(1);
    expect([res1.acquired, res2.acquired].filter((v) => !v)).toHaveLength(1);
  });

  it('acquires lock check after 23505 race in JS fallback (does not run unlocked in parallel)', async () => {
    const existingLockedLead = {
      id: 'lead-race-2',
      company_id: 'comp-1',
      phone: '5511977776666',
      name: 'Ana',
      is_processing: true,
      processing_started_at: new Date().toISOString(),
      control_mode: 'autonomous',
      last_message_at: new Date().toISOString(),
    } as unknown as Lead;

    const chainNull = {
      eq: () => chainNull,
      lt: () => chainNull,
      order: () => chainNull,
      limit: () => chainNull,
      select: () => chainNull,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table !== 'leads') return {};
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: existingLockedLead, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }),
            }),
          }),
          update: () => chainNull,
        };
      }),
    };

    const res = await acquireOrCreateLeadLock(mockAdmin as never, {
      companyId: 'comp-1',
      phone: '5511977776666',
      senderName: 'Ana',
      channel: 'whatsapp',
      channelId: null,
    });

    expect(res.acquired).toBe(false);
    expect(res.lead.id).toBe('lead-race-2');
  });
});
