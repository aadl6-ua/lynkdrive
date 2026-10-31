import { madridWallTimeToDate } from '../../shared/format';

/**
 * Lógica pura de disponibilidad del calendario de reservas (CalendarPicker).
 * Sin dependencias de React para poder probarla de forma aislada.
 */

export type AvailabilityWindowItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
};

export type BookingItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
};

export type DayStatus = 'past' | 'unavailable' | 'partial' | 'available';

const HOUR_MS = 60 * 60 * 1000;
const OPERATIONAL_BUFFER_MS = 2 * HOUR_MS;

/** Límites del día de calendario en hora de Madrid (independiente del dispositivo). */
export function getMadridDayBounds(date: Date): { start: number; end: number } {
  const start = madridWallTimeToDate(date.getFullYear(), date.getMonth(), date.getDate(), 0).getTime();
  const end = madridWallTimeToDate(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0).getTime();
  return { start, end };
}

export function getDayStatus(date: Date, availabilityWindows: AvailabilityWindowItem[], bookings: BookingItem[]): DayStatus {
  const { start: dayStart, end: dayEnd } = getMadridDayBounds(date);

  if (dayEnd <= Date.now()) {
    return 'past';
  }

  // Reservas confirmadas (pending/rechazadas/canceladas no bloquean) + 2h operativas.
  const blocked = bookings
    .filter((booking) => booking.status !== 'pending' && booking.status !== 'rejected' && booking.status !== 'cancelled')
    .map((booking) => ({
      start: new Date(booking.startDatetime).getTime(),
      end: new Date(booking.endDatetime).getTime() + OPERATIONAL_BUFFER_MS
    }));

  let longestFreeMs = 0;
  let totalFreeMs = 0;

  for (const window of availabilityWindows) {
    const realStart = Math.max(new Date(window.startDatetime).getTime(), dayStart, Date.now());
    const realEnd = Math.min(new Date(window.endDatetime).getTime(), dayEnd);

    if (realEnd <= realStart) {
      continue;
    }

    // Tramos libres dentro de la ventana tras restar bloqueos.
    const overlaps = blocked
      .filter((item) => item.start < realEnd && item.end > realStart)
      .sort((a, b) => a.start - b.start);

    let cursor = realStart;

    for (const item of overlaps) {
      if (item.start > cursor) {
        const free = item.start - cursor;
        totalFreeMs += free;
        longestFreeMs = Math.max(longestFreeMs, free);
      }

      cursor = Math.max(cursor, item.end);
    }

    if (realEnd > cursor) {
      const free = realEnd - cursor;
      totalFreeMs += free;
      longestFreeMs = Math.max(longestFreeMs, free);
    }
  }

  if (longestFreeMs >= 10 * HOUR_MS) {
    return 'available';
  }

  return totalFreeMs > 0 ? 'partial' : 'unavailable';
}

export function hasOwnerWindow(date: Date, availabilityWindows: AvailabilityWindowItem[]): boolean {
  const { start, end } = getMadridDayBounds(date);

  return availabilityWindows.some(
    (window) => new Date(window.startDatetime).getTime() < end && new Date(window.endDatetime).getTime() > start
  );
}

/** Estado del día en modo propietario: solo refleja si hay ventana publicada. */
export function getOwnerDayStatus(date: Date, availabilityWindows: AvailabilityWindowItem[]): DayStatus {
  const { end } = getMadridDayBounds(date);

  if (end <= Date.now()) {
    return 'past';
  }

  return hasOwnerWindow(date, availabilityWindows) ? 'available' : 'unavailable';
}
