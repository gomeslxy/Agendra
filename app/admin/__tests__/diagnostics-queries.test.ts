import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getUser: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@agendra.site' }),
  getCachedUserProfile: vi.fn().mockResolvedValue({ memberships: [{ company_id: 'comp-1' }] }),
}));

vi.mock('@/lib/admin/auth', () => ({
  getRequestMeta: vi.fn().mockResolvedValue({ ip: '127.0.0.1', ua: 'Vitest' }),
  isAllowedAdminEmail: vi.fn().mockReturnValue(true),
  hasValidAdminCookie: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getCompanyChannelDetails,
  getCompanyQuotaStatus,
  inspectLeadByPhone,
} from '../actions';
import { PLAN_LIMITS } from '@/lib/billing/plans';

describe('Admin Diagnostics & Quota Queries (P0-ENG-06 & P2-ENG-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inspectLeadByPhone selects real columns (heat_score, not intent/lead_score)', async () => {
    const selectedCols: Record<string, string> = {};

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: (cols: string) => {
              selectedCols.leads = cols;
              return {
                eq: () => ({
                  eq: () => ({
                    single: () =>
                      Promise.resolve({
                        data: { id: 'lead-1', name: 'Carlos', heat_score: 75 },
                        error: null,
                      }),
                  }),
                }),
              };
            },
          };
        }
        if (table === 'messages') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'processed_messages') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  or: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    });

    const res = await inspectLeadByPhone('company-123', '5511999999999');
    expect(res.success).toBe(true);
    expect(selectedCols.leads).toContain('heat_score');
    expect(selectedCols.leads).not.toContain('lead_score');
    expect(selectedCols.leads).not.toMatch(/\bintent\b/);
  });

  it('getCompanyChannelDetails selects phone instead of phone_number', async () => {
    let channelSelect = '';
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        select: (cols: string) => {
          channelSelect = cols;
          return {
            eq: () => ({
              order: () => Promise.resolve({ data: [{ id: 'ch-1', phone: '+5511' }], error: null }),
            }),
          };
        },
      })),
    });

    const res = await getCompanyChannelDetails('company-123');
    expect(res.success).toBe(true);
    expect(channelSelect).toContain('phone');
    expect(channelSelect).not.toContain('phone_number');
  });

  it('getCompanyQuotaStatus uses PLAN_LIMITS single source of truth', async () => {
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { plan_type: 'starter', extra_leads: 50 }, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: 10, error: null }),
          }),
        };
      }),
    });

    const res = await getCompanyQuotaStatus('company-123');
    expect(res.success).toBe(true);
    expect(res.quota?.plan_max_leads).toBe(PLAN_LIMITS.starter.maxLeads + 50);
  });
});
