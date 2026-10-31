import type { BookingStatus, PayoutStatus } from './bookings';

/** `stripe` con `STRIPE_SECRET_KEY` en el backend; `prototype` sin ella. */
export type PaymentMode = 'stripe' | 'prototype';

/** `GET /payments/config`. */
export interface PaymentConfigResponse {
  mode: PaymentMode;
  publishableKey: string | null;
  currency: string;
}

/** `GET /payments/bookings/:bookingId` y `POST .../confirm`. */
export interface PaymentStatusResponse {
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentIntentId: string | null;
  payoutStatus: PayoutStatus;
  totalPrice: number;
  currency: string;
}

/** `POST /payments/bookings/:bookingId/intent`. */
export interface PaymentIntentResponse {
  bookingId: string;
  paymentIntentId: string;
  clientSecret: string | null;
  amountCents: number;
  currency: string;
  mode: PaymentMode;
  publishableKey: string | null;
  destinationAccountId: string | null;
  applicationFeeCents: number | null;
}

/** Cuerpo opcional de `POST /payments/bookings/:bookingId/confirm`. */
export interface ConfirmPaymentRequest {
  paymentIntentId?: string;
}

/** `GET /payments/connect/status` (consultado en vivo a Stripe). */
export interface ConnectStatusResponse {
  mode: PaymentMode;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
}

/** `POST /payments/connect/onboarding-link` y `/dashboard-link`. */
export interface ConnectLinkResponse {
  accountId: string;
  url: string;
  expiresAt: number | null;
}
