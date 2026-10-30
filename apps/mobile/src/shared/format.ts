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
