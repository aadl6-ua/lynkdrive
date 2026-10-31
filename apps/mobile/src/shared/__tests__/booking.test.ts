import { BOOKING_STATUSES } from '@lynkdrive/shared';
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  BOOKING_TIMELINE,
  BookingStatus,
  isBookingActive,
  isBookingBillable,
  isBookingClosed,
  PAYOUT_STATUS_LABEL
} from '../booking';

const ALL_STATUSES: BookingStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'paid_confirmed',
  'in_progress',
  'completed',
  'cancelled'
];

describe('helpers de estado de reserva', () => {
  it('cubre exactamente los estados del contrato compartido', () => {
    expect(ALL_STATUSES).toEqual([...BOOKING_STATUSES]);
    expect(Object.keys(BOOKING_STATUS_LABEL).sort()).toEqual([...BOOKING_STATUSES].sort());
  });

  it('tiene etiqueta y tono para todos los estados', () => {
    for (const status of ALL_STATUSES) {
      expect(BOOKING_STATUS_LABEL[status]).toBeTruthy();
      expect(BOOKING_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it('la línea de tiempo sigue el flujo feliz de la máquina de estados', () => {
    expect(BOOKING_TIMELINE).toEqual(['pending', 'accepted', 'paid_confirmed', 'in_progress', 'completed']);
  });

  it('cerradas, activas y facturables', () => {
    const closed = ALL_STATUSES.filter(isBookingClosed);
    const active = ALL_STATUSES.filter(isBookingActive);
    const billable = ALL_STATUSES.filter(isBookingBillable);

    expect(closed).toEqual(['rejected', 'completed', 'cancelled']);
    // Las activas coinciden con las que bloquean la baja RGPD en la API.
    expect(active).toEqual(['pending', 'accepted', 'paid_confirmed', 'in_progress']);
    expect(billable).toEqual(['accepted', 'paid_confirmed', 'in_progress', 'completed']);
  });

  it('cada estado es activo o cerrado, nunca ambos', () => {
    for (const status of ALL_STATUSES) {
      expect(isBookingActive(status)).toBe(!isBookingClosed(status));
    }
  });

  it('traduce estados de pago al propietario', () => {
    expect(PAYOUT_STATUS_LABEL).toEqual({
      pending: 'Pendiente',
      processing: 'En proceso',
      paid: 'Pagado',
      failed: 'Fallido'
    });
  });
});
