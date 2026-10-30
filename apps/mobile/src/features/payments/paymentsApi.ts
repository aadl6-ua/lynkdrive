import { httpClient } from '../../api/http';

export type PaymentMode = 'stripe' | 'prototype';

export type PaymentConfig = {
  mode: PaymentMode;
  publishableKey: string | null;
  currency: string;
};

export type PaymentIntentResponse = {
  bookingId: string;
  paymentIntentId: string;
  clientSecret: string | null;
  amountCents: number;
  currency: string;
  mode: PaymentMode;
  publishableKey?: string | null;
};

export type ConnectStatus = {
  mode: PaymentMode;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
};

export type ConnectLink = {
  accountId: string;
  url: string;
  expiresAt: number | null;
};

const PROTOTYPE_CONFIG: PaymentConfig = { mode: 'prototype', publishableKey: null, currency: 'eur' };

/**
 * Lee el modo de pagos del backend. Si falla (backend antiguo o sin red), se asume prototipo
 * para conservar el comportamiento demo existente.
 */
export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  try {
    return (await httpClient.get<PaymentConfig>('/payments/config')).data;
  } catch {
    return PROTOTYPE_CONFIG;
  }
}

export async function createBookingPaymentIntent(bookingId: string): Promise<PaymentIntentResponse> {
  return (await httpClient.post<PaymentIntentResponse>(`/payments/bookings/${bookingId}/intent`)).data;
}

export async function confirmBookingPayment(bookingId: string, paymentIntentId: string): Promise<void> {
  await httpClient.post(`/payments/bookings/${bookingId}/confirm`, { paymentIntentId });
}

export async function fetchConnectStatus(): Promise<ConnectStatus> {
  return (await httpClient.get<ConnectStatus>('/payments/connect/status')).data;
}

export async function createConnectOnboardingLink(): Promise<ConnectLink> {
  return (await httpClient.post<ConnectLink>('/payments/connect/onboarding-link')).data;
}

export async function createConnectDashboardLink(): Promise<ConnectLink> {
  return (await httpClient.post<ConnectLink>('/payments/connect/dashboard-link')).data;
}

export function getPaymentsErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { response?: { data?: { message?: unknown } }; message?: unknown };
  const apiMessage = maybe?.response?.data?.message;

  if (typeof apiMessage === 'string') {
    return apiMessage;
  }

  if (Array.isArray(apiMessage) && typeof apiMessage[0] === 'string') {
    return apiMessage[0];
  }

  return fallback;
}
