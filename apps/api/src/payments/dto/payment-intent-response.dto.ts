import type { PaymentIntentResponse, PaymentMode } from '@lynkdrive/shared';

export class PaymentIntentResponseDto implements PaymentIntentResponse {
  bookingId!: string;
  paymentIntentId!: string;
  clientSecret!: string | null;
  amountCents!: number;
  currency!: string;
  mode!: PaymentMode;
  publishableKey!: string | null;
  destinationAccountId!: string | null;
  applicationFeeCents!: number | null;
}
