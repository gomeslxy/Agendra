import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFreeBusySlots } from '../google';

// Mock fetch to ensure it is not called during invalid/empty time ranges
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('google calendar getFreeBusySlots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array immediately if timeMin is empty or undefined', async () => {
    const res = await getFreeBusySlots('mock_token', 'mock_cal', '', '2026-06-11T12:00:00Z');
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty array immediately if timeMax is empty or undefined', async () => {
    const res = await getFreeBusySlots('mock_token', 'mock_cal', '2026-06-11T12:00:00Z', '');
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty array immediately if timeMax is equal to timeMin', async () => {
    const res = await getFreeBusySlots(
      'mock_token',
      'mock_cal',
      '2026-06-11T12:00:00Z',
      '2026-06-11T12:00:00Z'
    );
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty array immediately if timeMax is before timeMin', async () => {
    const res = await getFreeBusySlots(
      'mock_token',
      'mock_cal',
      '2026-06-11T12:00:00Z',
      '2026-06-11T11:00:00Z'
    );
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty array immediately if timeMin is invalid date', async () => {
    const res = await getFreeBusySlots('mock_token', 'mock_cal', 'invalid-date', '2026-06-11T12:00:00Z');
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty array immediately if timeMax is invalid date', async () => {
    const res = await getFreeBusySlots('mock_token', 'mock_cal', '2026-06-11T12:00:00Z', 'invalid-date');
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
