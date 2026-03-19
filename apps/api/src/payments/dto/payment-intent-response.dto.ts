export class PaymentIntentResponseDto {
  bookingId!: string;
  paymentIntentId!: string;
  clientSecret!: string | null;
  amountCents!: number;
  currency!: string;
  mode!: 'stripe' | 'prototype';
}
