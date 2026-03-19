import { BookingStatus } from 'src/bookings/dto/update-booking-status.dto';

export class PaymentStatusResponseDto {
  bookingId!: string;
  bookingStatus!: BookingStatus;
  paymentIntentId!: string | null;
  payoutStatus!: 'pending' | 'processing' | 'paid' | 'failed';
  totalPrice!: number;
  currency!: string;
}
