export class PaymentIntentResponseDto {
  bookingId!: string;
  paymentIntentId!: string;
  clientSecret!: string | null;
  amountCents!: number;
  currency!: string;
  mode!: 'stripe' | 'prototype';
  publishableKey!: string | null;
  destinationAccountId!: string | null;
  applicationFeeCents!: number | null;
}
