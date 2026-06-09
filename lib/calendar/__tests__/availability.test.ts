import { describe, it, expect } from 'vitest';
import { calculateAvailableSlots, isWithinWorkingHours } from '../availability';

const TZ = 'America/Sao_Paulo';
const FULL_WEEK: Record<string, [string, string]> = {
  mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'], fri: ['09:00', '18:00'],
};

// Monday 2026-06-08 08:00 America/Sao_Paulo (UTC-3) = 11:00 UTC
const MONDAY_MORNING = new Date('2026-06-08T11:00:00Z');

describe('calculateAvailableSlots', () => {
  it('generates slots for the WHOLE daysAhead window (no false "lotado" after 30 slots)', () => {
    const slots = calculateAvailableSlots({
      timezone: TZ,
      workingHours: FULL_WEEK,
      durationMinutes: 30,
      busyIntervals: [],
      daysAhead: 7,
      now: MONDAY_MORNING,
    });

    // Empty agenda, 9h-18h, 30-min steps → far more than the old 30-slot cap
    expect(slots.length).toBeGreaterThan(30);

    // Friday (day 5 of the window) MUST have slots — with the old cap of 30 it
    // had zero and checkAvailability reported it as "LOTADO".
    const fridayKey = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
      .format(new Date('2026-06-12T15:00:00Z'));
    const fridaySlots = slots.filter((s) =>
      new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
        .format(new Date(s.start)) === fridayKey
    );
    expect(fridaySlots.length).toBeGreaterThan(0);
  });

  it('respects bufferMinutes against busy intervals (consistency with book_appointment_atomic)', () => {
    // Busy block Monday 14:00–15:00 local (17:00–18:00 UTC)
    const busy = [{ start: new Date('2026-06-08T17:00:00Z'), end: new Date('2026-06-08T18:00:00Z') }];

    const noBuffer = calculateAvailableSlots({
      timezone: TZ, workingHours: FULL_WEEK, durationMinutes: 30,
      busyIntervals: busy, daysAhead: 1, now: MONDAY_MORNING, bufferMinutes: 0,
    });
    const withBuffer = calculateAvailableSlots({
      timezone: TZ, workingHours: FULL_WEEK, durationMinutes: 30,
      busyIntervals: busy, daysAhead: 1, now: MONDAY_MORNING, bufferMinutes: 30,
    });

    // 13:30 local starts 30min before the busy block: allowed without buffer,
    // rejected with a 30-min buffer (book_appointment_atomic would refuse it).
    const slot1330 = '2026-06-08T16:30:00.000Z';
    expect(noBuffer.some((s) => s.start === slot1330)).toBe(true);
    expect(withBuffer.some((s) => s.start === slot1330)).toBe(false);
  });

  it('never returns slots outside working hours', () => {
    const slots = calculateAvailableSlots({
      timezone: TZ, workingHours: FULL_WEEK, durationMinutes: 60,
      busyIntervals: [], daysAhead: 3, now: MONDAY_MORNING,
    });
    for (const s of slots) {
      expect(isWithinWorkingHours(new Date(s.start), 60, FULL_WEEK, TZ)).toBe(true);
    }
  });
});

describe('isWithinWorkingHours', () => {
  it('accepts a slot inside the schedule', () => {
    // Monday 10:00 local = 13:00 UTC
    expect(isWithinWorkingHours(new Date('2026-06-08T13:00:00Z'), 60, FULL_WEEK, TZ)).toBe(true);
  });

  it('rejects 3am bookings (model-fabricated start_time)', () => {
    // Monday 03:00 local = 06:00 UTC
    expect(isWithinWorkingHours(new Date('2026-06-08T06:00:00Z'), 60, FULL_WEEK, TZ)).toBe(false);
  });

  it('rejects closed days (Sunday)', () => {
    // Sunday 2026-06-07 10:00 local = 13:00 UTC
    expect(isWithinWorkingHours(new Date('2026-06-07T13:00:00Z'), 60, FULL_WEEK, TZ)).toBe(false);
  });

  it('rejects a slot whose END spills past closing time', () => {
    // Monday 17:30 local + 60min ends 18:30 > 18:00
    expect(isWithinWorkingHours(new Date('2026-06-08T20:30:00Z'), 60, FULL_WEEK, TZ)).toBe(false);
    // ...but a 30-min service at 17:30 fits exactly
    expect(isWithinWorkingHours(new Date('2026-06-08T20:30:00Z'), 30, FULL_WEEK, TZ)).toBe(true);
  });
});
