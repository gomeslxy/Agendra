/**
 * Agendra — Availability Core
 * Handles calculation of free slots based on:
 * 1. Working Hours (from persona_config)
 * 2. Service Duration
 * 3. Busy intervals (Google Calendar + local events)
 * 4. Timezone resolution
 */

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface AvailabilityOptions {
  timezone: string;
  workingHours: Record<string, [string, string]>;
  durationMinutes: number;
  busyIntervals: TimeRange[];
  daysAhead: number;
  bufferMinutes?: number;
  now?: Date; // Optional for testing
}

export interface AvailableSlot {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  label: string; // User-friendly label
}

export function calculateAvailableSlots(options: AvailabilityOptions): AvailableSlot[] {
  const {
    timezone,
    workingHours,
    durationMinutes,
    busyIntervals,
    daysAhead,
    bufferMinutes = 0,
    now: providedNow
  } = options;

  const now = providedNow || new Date();
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  const dayNames: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
  const ptDays: Record<string, string> = {
    mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta',
    fri: 'Sexta', sat: 'Sábado', sun: 'Domingo',
  };
  const ptMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const availableSlots: AvailableSlot[] = [];
  let cursor = new Date(now);
  
  // Start from the next whole hour or 30min block to keep it clean
  // We round UP to the next 30min mark
  const minutes = cursor.getMinutes();
  if (minutes < 30) {
    cursor.setMinutes(30, 0, 0);
  } else {
    cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
  }

  // Ensure at least 1h buffer from "now" for AI bookings to avoid impossible slots
  if (cursor.getTime() < now.getTime() + 60 * 60 * 1000) {
    cursor.setMinutes(cursor.getMinutes() + 60);
  }

  // Returns UTC offset in minutes for a given timezone at a given UTC moment.
  function getOffsetMinutes(utcDate: Date, tz: string): number {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(utcDate);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value;
      
      const localDate = new Date(Date.UTC(
        Number(getPart('year')),
        Number(getPart('month')) - 1,
        Number(getPart('day')),
        Number(getPart('hour')),
        Number(getPart('minute')),
        Number(getPart('second'))
      ));
      
      return (localDate.getTime() - utcDate.getTime()) / 60000;
    } catch (e) {
      console.error('Error calculating offset:', e);
      return -180; // Default to BRT
    }
  }

  while (cursor < rangeEnd && availableSlots.length < 15) {
    const offsetMin = getOffsetMinutes(cursor, timezone);
    const offsetMs = offsetMin * 60000;
    const localCursor = new Date(cursor.getTime() + offsetMs);
    const localDayOfWeek = localCursor.getUTCDay();
    const localHour = localCursor.getUTCHours();
    const localMinute = localCursor.getUTCMinutes();

    const dayKey = dayNames[localDayOfWeek];
    const hours = workingHours[dayKey];

    if (hours) {
      const [startHH, startMM] = hours[0].split(':').map(Number);
      const [endHH, endMM] = hours[1].split(':').map(Number);
      
      const localMinutes = localHour * 60 + localMinute;
      const workStart = startHH * 60 + startMM;
      const workEnd = endHH * 60 + endMM;
      
      const totalSlotDuration = durationMinutes + bufferMinutes;
      const slotEndLocalMinutes = localMinutes + totalSlotDuration;

      if (localMinutes >= workStart && slotEndLocalMinutes <= workEnd) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
        
        // Check if overlaps with any busy interval
        const isBusy = busyIntervals.some(
          (busy) => busy.start < slotEnd && busy.end > cursor
        );

        if (!isBusy) {
          const pad = (n: number) => String(n).padStart(2, '0');
          const endLocal = new Date(cursor.getTime() + offsetMs + durationMinutes * 60000);
          const label = `${ptDays[dayKey]}, ${pad(localCursor.getUTCDate())} ${ptMonths[localCursor.getUTCMonth()]} · ${pad(localHour)}:${pad(localMinute)}–${pad(endLocal.getUTCHours())}:${pad(endLocal.getUTCMinutes())}`;
          
          availableSlots.push({ 
            start: cursor.toISOString(), 
            end: slotEnd.toISOString(), 
            label 
          });
        }
      }

      // Step by 30 minutes for better density
      cursor = new Date(cursor.getTime() + 30 * 60000);

      // If we passed the end of working hours for the day, skip to next day
      if (localMinutes >= workEnd) {
        const nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
        nextLocalMidnight.setUTCHours(0, 0, 0, 0);
        cursor = new Date(nextLocalMidnight.getTime() - offsetMs);
      }
    } else {
      // Not a working day, skip to next day
      const nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
      nextLocalMidnight.setUTCHours(0, 0, 0, 0);
      cursor = new Date(nextLocalMidnight.getTime() - offsetMs);
    }
  }

  return availableSlots;
}
