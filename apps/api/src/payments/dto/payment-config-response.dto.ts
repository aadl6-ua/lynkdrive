export class PaymentConfigResponseDto {
  mode!: 'stripe' | 'prototype';
  publishableKey!: string | null;
  currency!: string;
}
