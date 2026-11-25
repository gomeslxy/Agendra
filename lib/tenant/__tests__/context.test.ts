import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockCookieGet = vi.fn();
const mockCookieSet = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: mockCookieSet,
  })),
}));

import {
  resolveActiveMembership,
  requireTenantContext,
  TenantContextError,
  ACTIVE_COMPANY_COOKIE,
} from '../context';

describe('Multi-tenant context resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockReturnValue(undefined);
  });

  it('prefers completed onboarding company over phantom company when no cookie is set', () => {
    const picked = resolveActiveMembership([
      { company_id: '00000000-0000-0000-0000-000000000001', role: 'owner', onboarding_completed: false },
      { company_id: '00000000-0000-0000-0000-000000000002', role: 'member', onboarding_completed: true },
    ]);
    expect(picked?.company_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(picked?.role).toBe('member');
  });

  it('honors valid active company cookie over default ordering', () => {
    const picked = resolveActiveMembership(
      [
        { company_id: '00000000-0000-0000-0000-000000000001', role: 'owner', onboarding_completed: true },
        { company_id: '00000000-0000-0000-0000-000000000002', role: 'admin', onboarding_completed: true },
      ],
      '00000000-0000-0000-0000-000000000002',
    );
    expect(picked?.company_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(picked?.role).toBe('admin');
  });

  it('rejects requireAdmin when user is owner in company A but member in active company B', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@agendra.site' } },
      error: null,
    });
    mockCookieGet.mockImplementation((name: string) =>
      name === ACTIVE_COMPANY_COOKIE
        ? { value: '00000000-0000-0000-0000-000000000002' }
        : undefined,
    );
    mockFrom.mockReturnValue({
      select: () => ({
        eq: async () => ({
          data: [
            {
              company_id: '00000000-0000-0000-0000-000000000001',
              role: 'owner',
              companies: { onboarding_completed: true },
            },
            {
              company_id: '00000000-0000-0000-0000-000000000002',
              role: 'member',
              companies: { onboarding_completed: true },
            },
          ],
          error: null,
        }),
      }),
    });

    await expect(requireTenantContext({ requireAdmin: true })).rejects.toThrow(TenantContextError);
    await expect(requireTenantContext({ requireAdmin: true })).rejects.toMatchObject({ status: 403 });
  });

  it('rejects targetCompanyId when user does not belong to that tenant', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@agendra.site' } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: async () => ({
          data: [
            {
              company_id: '00000000-0000-0000-0000-000000000001',
              role: 'owner',
              companies: { onboarding_completed: true },
            },
          ],
          error: null,
        }),
      }),
    });

    await expect(
      requireTenantContext({ targetCompanyId: '99999999-9999-9999-9999-999999999999' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
