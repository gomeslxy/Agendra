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
  /**
   * Hard cap on generated slots. Must be large enough to cover the whole
   * daysAhead window — if the cap is hit mid-window, later days produce zero
   * slots and get incorrectly reported as "lotado" by checkAvailability.
   */
  maxSlots?: number;
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
    now: providedNow,
    // 30-min steps × ~20h of working hours = 40 slots/day worst case.
    maxSlots = Math.max(daysAhead, 1) * 40,
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
  // Returns UTC offset in minutes for a given timezone at a given UTC moment.
  // 100% robust conversion using standard en-US double formatting, preventing midnight 24h bugs.
  function getOffsetMinutes(utcDate: Date, tz: string): number {
    try {
      const tzString = utcDate.toLocaleString('en-US', { timeZone: tz });
      const localDate = new Date(tzString);
      const utcString = utcDate.toLocaleString('en-US', { timeZone: 'UTC' });
      const utcNormalized = new Date(utcString);
      return Math.round((localDate.getTime() - utcNormalized.getTime()) / 60000);
    } catch (e) {
      console.error('Error calculating offset:', e);
      return -180; // Default to BRT
    }
  }

  while (cursor < rangeEnd && availableSlots.length < maxSlots) {
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
      
      // Optimization: if current time is before working hours start, jump directly to work start
      if (localMinutes < workStart) {
        const minutesToStart = workStart - localMinutes;
        cursor = new Date(cursor.getTime() + minutesToStart * 60000);
        continue;
      }
      
      const totalSlotDuration = durationMinutes + bufferMinutes;
      const slotEndLocalMinutes = localMinutes + totalSlotDuration;

      if (localMinutes >= workStart && slotEndLocalMinutes <= workEnd) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);

        // Check if overlaps with any busy interval, expanded by the buffer.
        // book_appointment_atomic rejects bookings within bufferMinutes of an
        // existing event, so slots offered here must respect the same margin —
        // otherwise the AI offers a slot that booking then refuses.
        const bufferMs = bufferMinutes * 60000;
        const isBusy = busyIntervals.some(
          (busy) =>
            busy.start.getTime() < slotEnd.getTime() + bufferMs &&
            busy.end.getTime() > cursor.getTime() - bufferMs
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
        } else {
          // console.log(`[Avail] Slot ${localHour}:${localMinute} is BUSY`);
        }
      }

      // Step by 30 minutes for better density
      cursor = new Date(cursor.getTime() + 30 * 60000);

      // If we passed the end of working hours for the day, skip to next day
      if (localMinutes >= workEnd) {
        const nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
        nextLocalMidnight.setUTCHours(0, 0, 0, 0);
        // Recompute the offset at the target instant: reusing the current day's
        // offset lands the cursor 1h off when a DST transition happens overnight.
        const nextOffsetMs = getOffsetMinutes(new Date(nextLocalMidnight.getTime() - offsetMs), timezone) * 60000;
        cursor = new Date(nextLocalMidnight.getTime() - nextOffsetMs);
      }
    } else {
      // Not a working day, skip to next day
      const nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
      nextLocalMidnight.setUTCHours(0, 0, 0, 0);
      const nextOffsetMs = getOffsetMinutes(new Date(nextLocalMidnight.getTime() - offsetMs), timezone) * 60000;
      cursor = new Date(nextLocalMidnight.getTime() - nextOffsetMs);
    }
  }

  return availableSlots;
}

/**
 * Validates that an appointment [start, start+duration] falls entirely inside
 * the company's configured working hours for that weekday, in the company
 * timezone. Used as a server-side guard so the AI can never book outside the
 * configured schedule, even if the model fabricates a start_time instead of
 * using a slot returned by checkAvailability.
 */
export function isWithinWorkingHours(
  start: Date,
  durationMinutes: number,
  workingHours: Record<string, [string, string]>,
  timezone: string,
): boolean {
  const dayNames: Record<string, string> = {
    Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
  };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(start);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const dayKey = dayNames[get('weekday')];
  if (!dayKey) return false;
  const hours = workingHours[dayKey];
  if (!hours) return false; // closed that day

  const [startHH, startMM] = hours[0].split(':').map(Number);
  const [endHH, endMM] = hours[1].split(':').map(Number);
  // Intl with hour12:false can render midnight as "24"
  const localHour = Number(get('hour')) % 24;
  const localMinutes = localHour * 60 + Number(get('minute'));
  const workStart = startHH * 60 + startMM;
  const workEnd = endHH * 60 + endMM;

  return localMinutes >= workStart && localMinutes + durationMinutes <= workEnd;
}
