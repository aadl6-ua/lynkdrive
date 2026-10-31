import { BookingStatus } from './update-booking-status.dto';
import type { BookingResponse, PayoutStatus } from '@lynkdrive/shared';

export type { PayoutStatus };

export class BookingResponseDto implements BookingResponse<Date> {
  id!: string;
  vehicleId!: string;
  ownerId!: string;
  driverId!: string;
  startDatetime!: Date;
  endDatetime!: Date;
  pricePerDayAtBooking!: number;
  platformFee!: number;
  totalPrice!: number;
  status!: BookingStatus;
  paymentIntentId!: string | null;
  stripeTransferId!: string | null;
  payoutStatus!: PayoutStatus;
  ownerContactMethod!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
