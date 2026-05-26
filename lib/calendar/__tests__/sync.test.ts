// lib/calendar/__tests__/sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Mock Google Calendar API listGCalEvents helper
vi.mock('@/lib/calendar/google', () => ({
  listGCalEvents: vi.fn(),
}));

// Mock Notification helpers
vi.mock('@/lib/notifications/create', () => ({
  createNotificationForUsers: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { listGCalEvents } from '@/lib/calendar/google';
import { createNotificationForUsers } from '@/lib/notifications/create';
import { syncCompanyCalendar } from '../sync';

describe('Google Calendar Sync Resilience (Task 3)', () => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  google_refresh_token: 'valid-refresh-token',
                  google_calendar_id: 'primary',
                  gcal_sync_token: 'previous-sync-token',
                },
                error: null,
              }),
            }),
          }),
          update: mockUpdate,
        };
      } else if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({
                data: [{ user_id: 'owner-user-id' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockUpdate.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockResolvedValue({ error: null });

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });
  });

  it('runs sync successfully when API succeeds', async () => {
    (listGCalEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      events: [],
      nextSyncToken: 'new-sync-token',
    });

    const result = await syncCompanyCalendar('company-123');
    expect(result.skipped).toBeUndefined();
    expect(result.inserted).toBe(0);
    expect(result.syncToken).toBe('new-sync-token');
  });

  it('proactively intercepts invalid_grant, clears database tokens, and alerts users', async () => {
    // 1. Force GCal API to throw "invalid_grant" (revoked credentials)
    (listGCalEvents as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Google Calendar list events falhou: 400 — {"error":"invalid_grant"}')
    );

    const result = await syncCompanyCalendar('company-revoked');

    // Asserts:
    // A. Returns a skipped sync result instead of throwing/crashing
    expect(result).toEqual({ skipped: true, inserted: 0, updated: 0, deleted: 0, syncToken: '' });

    // B. Cleared refresh tokens and credentials in DB
    expect(mockFrom).toHaveBeenCalledWith('companies');
    expect(mockUpdate).toHaveBeenCalledWith({
      google_refresh_token: null,
      google_calendar_id: null,
      google_calendar_email: null,
      gcal_sync_token: null,
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'company-revoked');

    // C. Dispatched high-priority in-app notification to the owners/admins
    expect(createNotificationForUsers).toHaveBeenCalledWith(
      [{ user_id: 'owner-user-id' }],
      expect.objectContaining({
        company_id: 'company-revoked',
        type: 'channel_error',
        priority: 'high',
        title: 'Agenda Google desconectada',
      })
    );
  });
});
