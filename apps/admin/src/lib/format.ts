import type { BookingStatus, IncidentStatus } from './types';

// Presentación en Europe/Madrid (los datos llegan en UTC).
const TIME_ZONE = 'Europe/Madrid';

const dateTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short'
});

const dateFormatter = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, dateStyle: 'medium' });

const currencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '—';
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export function formatMoney(value: number): string {
  return currencyFormatter.format(value);
}

export function formatMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

export function fullName(person: { firstName: string; lastName: string } | null | undefined): string {
  return person ? `${person.firstName} ${person.lastName}`.trim() : '—';
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  paid_confirmed: 'Pagada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada'
};

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'En proceso',
  paid: 'Pagado',
  failed: 'Fallido'
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Abierta',
  in_progress: 'En gestión',
  resolved: 'Resuelta',
  closed: 'Cerrada'
};

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function bookingTone(status: BookingStatus): Tone {
  switch (status) {
    case 'completed':
    case 'paid_confirmed':
      return 'success';
    case 'in_progress':
    case 'accepted':
      return 'info';
    case 'pending':
      return 'warning';
    case 'rejected':
    case 'cancelled':
      return 'danger';
  }
}

export function incidentTone(status: IncidentStatus): Tone {
  switch (status) {
    case 'open':
      return 'danger';
    case 'in_progress':
      return 'warning';
    case 'resolved':
      return 'success';
    case 'closed':
      return 'neutral';
  }
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
