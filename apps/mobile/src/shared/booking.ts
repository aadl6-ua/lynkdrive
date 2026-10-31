import type { BookingStatus, PayoutStatus } from '@lynkdrive/shared';
import type { StatusChipTone } from './ui/StatusChip';

export type { BookingStatus };

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  paid_confirmed: 'Pago confirmado',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada'
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, StatusChipTone> = {
  pending: 'warning',
  accepted: 'info',
  rejected: 'danger',
  paid_confirmed: 'success',
  in_progress: 'accent',
  completed: 'success',
  cancelled: 'neutral'
};

/** Pasos del flujo feliz, usados para la línea de tiempo del detalle. */
export const BOOKING_TIMELINE: BookingStatus[] = ['pending', 'accepted', 'paid_confirmed', 'in_progress', 'completed'];

export function isBookingClosed(status: BookingStatus): boolean {
  return status === 'rejected' || status === 'cancelled' || status === 'completed';
}

export function isBookingActive(status: BookingStatus): boolean {
  return status === 'pending' || status === 'accepted' || status === 'paid_confirmed' || status === 'in_progress';
}

/** Estados que cuentan como importe real (excluye rechazadas/canceladas). */
export function isBookingBillable(status: BookingStatus): boolean {
  return status === 'accepted' || status === 'paid_confirmed' || status === 'in_progress' || status === 'completed';
}

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Pendiente',
  processing: 'En proceso',
  paid: 'Pagado',
  failed: 'Fallido'
};
