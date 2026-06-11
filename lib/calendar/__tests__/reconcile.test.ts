// lib/calendar/__tests__/reconcile.test.ts
//
// Push reconciliation: eventos cuja escrita Agendra→GCal falhou (API do Google
// fora do ar no booking/cancel/reschedule, gcal_sync_status='error') devem ser
// reparados a cada ciclo do cron gcal-sync — fila de retry durável.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/calendar/google', () => ({
  listGCalEvents: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
  updateGCalEvent: vi.fn(),
  deleteGCalEvent: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import {
  createGoogleCalendarEvent,
  updateGCalEvent,
  deleteGCalEvent,
} from '@/lib/calendar/google';
import { reconcileGCalPushFailures } from '../sync';

const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const FUTURE_END = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
const PAST_START = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
const PAST_END = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('reconcileGCalPushFailures', () => {
  let updates: Array<{ id: string; payload: any }>;

  function buildAdmin(brokenEvents: any[]) {
    updates = [];
    return {
      from: vi.fn((table: string) => {
        if (table !== 'events') throw new Error(`unexpected table ${table}`);
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: brokenEvents, error: null }),
                })),
              })),
            })),
          })),
          update: vi.fn((payload: any) => ({
            eq: vi.fn((_col: string, id: string) => ({
              eq: vi.fn().mockImplementation(() => {
                updates.push({ id, payload });
                return Promise.resolve({ error: null });
              }),
            })),
          })),
        };
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recreates the missing GCal event for a future booking made while GCal was down', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin([{
      id: 'ev-1', title: 'Corte - Carlos', notes: null, status: 'confirmed',
      start_time: FUTURE_START, end_time: FUTURE_END,
      gcal_event_id: null, leads: { email: 'carlos@example.com' },
    }]));
    (createGoogleCalendarEvent as any).mockResolvedValue('gcal-new-1');

    const result = await reconcileGCalPushFailures('company-1', 'rt-token', 'primary');

    expect(result).toEqual({ repaired: 1, stillFailing: 0 });
    expect(createGoogleCalendarEvent).toHaveBeenCalledWith('rt-token', 'primary',
      expect.objectContaining({
        title: 'Corte - Carlos',
        start: FUTURE_START,
        end: FUTURE_END,
        attendeeEmail: 'carlos@example.com',
      }));
    expect(updates).toContainEqual({
      id: 'ev-1',
      payload: { gcal_event_id: 'gcal-new-1', gcal_sync_status: 'synced' },
    });
  });

  it('retries the GCal delete for a locally-cancelled event', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin([{
      id: 'ev-2', title: 'Barba', notes: null, status: 'cancelled',
      start_time: FUTURE_START, end_time: FUTURE_END,
      gcal_event_id: 'gcal-old-2', leads: null,
    }]));
    (deleteGCalEvent as any).mockResolvedValue(undefined);

    const result = await reconcileGCalPushFailures('company-1', 'rt-token', 'primary');

    expect(result.repaired).toBe(1);
    expect(deleteGCalEvent).toHaveBeenCalledWith('rt-token', 'primary', 'gcal-old-2');
    expect(updates).toContainEqual({ id: 'ev-2', payload: { gcal_sync_status: 'synced' } });
  });

  it('retries the GCal patch for a rescheduled event that already has a gcal id', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin([{
      id: 'ev-3', title: 'Corte', notes: 'remarcado', status: 'confirmed',
      start_time: FUTURE_START, end_time: FUTURE_END,
      gcal_event_id: 'gcal-3', leads: null,
    }]));
    (updateGCalEvent as any).mockResolvedValue(undefined);

    const result = await reconcileGCalPushFailures('company-1', 'rt-token', 'primary');

    expect(result.repaired).toBe(1);
    expect(updateGCalEvent).toHaveBeenCalledWith('rt-token', 'primary', 'gcal-3',
      expect.objectContaining({ start: FUTURE_START, end: FUTURE_END }));
  });

  it('stops retrying past events (clears the status without calling the API)', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin([{
      id: 'ev-4', title: 'Antigo', notes: null, status: 'confirmed',
      start_time: PAST_START, end_time: PAST_END,
      gcal_event_id: null, leads: null,
    }]));

    const result = await reconcileGCalPushFailures('company-1', 'rt-token', 'primary');

    expect(result).toEqual({ repaired: 0, stillFailing: 0 });
    expect(createGoogleCalendarEvent).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ id: 'ev-4', payload: { gcal_sync_status: null } });
  });

  it('keeps gcal_sync_status=error when the API fails again (retried next cycle)', async () => {
    (createAdminClient as any).mockReturnValue(buildAdmin([{
      id: 'ev-5', title: 'Corte', notes: null, status: 'confirmed',
      start_time: FUTURE_START, end_time: FUTURE_END,
      gcal_event_id: null, leads: null,
    }]));
    (createGoogleCalendarEvent as any).mockRejectedValue(new Error('503 backend error'));

    const result = await reconcileGCalPushFailures('company-1', 'rt-token', 'primary');

    expect(result).toEqual({ repaired: 0, stillFailing: 1 });
    expect(updates).toHaveLength(0); // status untouched → next cron cycle retries
  });
});
