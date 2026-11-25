export interface ExistingEventSlot {
  id: string;
  start_time: string;
  end_time: string;
  status?: string | null;
}

/**
 * Verifica se um intervalo [start, end] colide com eventos existentes considerando buffer.
 */
export function hasTimeConflict(
  existing: ExistingEventSlot[],
  start: Date,
  end: Date,
  bufferMinutes = 0,
  excludeEventId?: string,
): boolean {
  const bufMs = Math.max(0, bufferMinutes) * 60_000;
  const bufferedStart = start.getTime() - bufMs;
  const bufferedEnd = end.getTime() + bufMs;

  return existing.some((ev) => {
    if (excludeEventId && ev.id === excludeEventId) return false;
    if (ev.status === "cancelled") return false;
    const evStart = new Date(ev.start_time).getTime();
    const evEnd = new Date(ev.end_time).getTime();
    return evStart < bufferedEnd && evEnd > bufferedStart;
  });
}

/**
 * Calcula `remind_at` (ISO) para lembrete de agendamento caso ainda esteja no futuro.
 */
export function computeReminderAt(
  eventStart: Date,
  advanceHours = 2,
  now = new Date(),
): string | null {
  const remindAtMs = eventStart.getTime() - Math.max(1, advanceHours) * 3_600_000;
  if (remindAtMs <= now.getTime()) return null;
  return new Date(remindAtMs).toISOString();
}
