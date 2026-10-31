/**
 * Formateo de presentación: siempre zona Europe/Madrid y moneda EUR (es-ES).
 * La lógica interna y la API trabajan en UTC (ISO 8601).
 */
const TIME_ZONE = 'Europe/Madrid';
const LOCALE = 'es-ES';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const compactCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE
});

const shortDateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE
});

const monthYearFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE
});

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanDot(value: string): string {
  // es-ES añade punto en abreviaturas ("oct.") y lo dejamos más limpio en UI.
  return value.replace(/\./g, '');
}

export function formatCurrencyEUR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  return currencyFormatter.format(Number(value));
}

/** Precio sin decimales cuando es entero (ej. "45 €"), útil en tarjetas. */
export function formatPriceCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  return compactCurrencyFormatter.format(Number(value));
}

export function formatDateTimeMadrid(value: string | Date): string {
  const date = toDate(value);
  return date ? cleanDot(dateTimeFormatter.format(date)) : '—';
}

export function formatShortDateTimeMadrid(value: string | Date): string {
  const date = toDate(value);
  return date ? cleanDot(shortDateTimeFormatter.format(date)) : '—';
}

export function formatDateMadrid(value: string | Date): string {
  const date = toDate(value);
  return date ? cleanDot(dateFormatter.format(date)) : '—';
}

export function formatMonthYearMadrid(value: string | Date): string {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  const label = monthYearFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDateRangeMadrid(start: string | Date, end: string | Date): string {
  return `${formatShortDateTimeMadrid(start)} → ${formatShortDateTimeMadrid(end)}`;
}

/** Días facturables con la misma regla que el backend (ceil, mínimo 1). */
export function getBillableDays(start: string | Date, end: string | Date): number {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return 1;
  }

  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const initials = `${firstName?.trim()?.[0] ?? ''}${lastName?.trim()?.[0] ?? ''}`.toUpperCase();
  return initials || 'U';
}

export function getInitialsFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return getInitials(parts[0], parts[1]);
}

export function getDisplayName(firstName?: string | null, lastName?: string | null, fallback = 'Usuario'): string {
  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return fullName || fallback;
}

export function translateFuelType(fuelType: string | null | undefined): string | null {
  const map: Record<string, string> = {
    gasoline: 'Gasolina',
    diesel: 'Diésel',
    electric: 'Eléctrico',
    hybrid: 'Híbrido'
  };

  return fuelType ? map[fuelType.toLowerCase()] ?? null : null;
}

export function translateTransmission(transmission: string | null | undefined): string | null {
  const map: Record<string, string> = {
    manual: 'Manual',
    automatic: 'Automático'
  };

  return transmission ? map[transmission.toLowerCase()] ?? null : null;
}

/* -------------------------------------------------------------------------- */
/* Conversión hora de pared Europe/Madrid <-> instante UTC                     */
/* -------------------------------------------------------------------------- */

const madridPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE
});

export type MadridParts = { year: number; month: number; day: number; hour: number; minute: number };

/** Componentes de fecha/hora tal y como se ven en Madrid (month 0-11). */
export function getMadridParts(value: string | Date): MadridParts | null {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const parts = madridPartsFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read('year'),
    month: read('month') - 1,
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute')
  };
}

/**
 * Instante UTC que corresponde a una hora de pared en Madrid. Tiene en cuenta
 * el horario de verano sin depender de la zona horaria del dispositivo.
 */
export function madridWallTimeToDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month, day, hour, minute);
  const parts = getMadridParts(new Date(guess));

  if (!parts) {
    return new Date(guess);
  }

  const asUtc = Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute);
  const offset = asUtc - guess;
  const candidate = new Date(guess - offset);
  // Segundo ajuste por si el cambio de hora cae entre guess y candidate.
  const check = getMadridParts(candidate);

  if (check && check.hour !== hour) {
    const checkUtc = Date.UTC(check.year, check.month, check.day, check.hour, check.minute);
    return new Date(candidate.getTime() - (checkUtc - guess));
  }

  return candidate;
}

/** Fecha de calendario (y/m/d locales del objeto) + hora de Madrid -> ISO UTC. */
export function calendarDayHourToIso(date: Date, hour: number): string {
  return madridWallTimeToDate(date.getFullYear(), date.getMonth(), date.getDate(), hour).toISOString();
}

/** ISO UTC -> fecha de calendario (medianoche local del dispositivo) + hora en Madrid. */
export function isoToCalendarDayHour(value: string): { date: Date; hour: number } | null {
  const parts = getMadridParts(value);
  return parts ? { date: new Date(parts.year, parts.month, parts.day), hour: parts.hour } : null;
}

export function formatTimeMadrid(value: string | Date): string {
  const parts = getMadridParts(value);
  return parts ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` : '—';
}

export function formatRelativeFromNow(value: string | Date): string {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / 3_600_000);

  if (Math.abs(diffHours) < 24) {
    if (diffHours === 0) {
      return 'ahora';
    }

    return diffHours > 0 ? `en ${pluralize(diffHours, 'hora', 'horas')}` : `hace ${pluralize(-diffHours, 'hora', 'horas')}`;
  }

  const diffDays = Math.round(diffHours / 24);
  return diffDays > 0 ? `en ${pluralize(diffDays, 'día', 'días')}` : `hace ${pluralize(-diffDays, 'día', 'días')}`;
}
