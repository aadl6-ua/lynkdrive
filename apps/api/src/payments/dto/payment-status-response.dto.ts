import { BookingStatus } from 'src/bookings/dto/update-booking-status.dto';
import type { PaymentStatusResponse, PayoutStatus } from '@lynkdrive/shared';

export class PaymentStatusResponseDto implements PaymentStatusResponse {
  bookingId!: string;
  bookingStatus!: BookingStatus;
  paymentIntentId!: string | null;
  payoutStatus!: PayoutStatus;
  totalPrice!: number;
  currency!: string;
}
