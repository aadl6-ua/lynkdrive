import type { IsoDateString } from './common';

/** Máquina de estados de `booking_status` (ver CLAUDE.md, sección 5). */
export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'paid_confirmed',
  'in_progress',
  'completed',
  'cancelled'
];

/** Estado del pago al propietario (`payout_status_enum`). */
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

/** Respuesta de `/bookings` (listados, detalle, creación y cambio de estado). */
export interface BookingResponse<TDate = IsoDateString> {
  id: string;
  vehicleId: string;
  ownerId: string;
  driverId: string;
  startDatetime: TDate;
  endDatetime: TDate;
  pricePerDayAtBooking: number;
  platformFee: number;
  totalPrice: number;
  status: BookingStatus;
  paymentIntentId: string | null;
  stripeTransferId: string | null;
  payoutStatus: PayoutStatus;
  ownerContactMethod: string | null;
  createdAt: TDate;
  updatedAt: TDate;
}

/** Cuerpo de `POST /bookings` (el conductor se toma del JWT). */
export interface CreateBookingRequest {
  vehicleId: string;
  startDatetime: IsoDateString;
  endDatetime: IsoDateString;
}

/** Cuerpo de `PUT /bookings/:id/status`. */
export interface UpdateBookingStatusRequest {
  status: BookingStatus;
  ownerContactMethod?: string;
}
