import { BookingStatus } from './update-booking-status.dto';

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export class BookingResponseDto {
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
