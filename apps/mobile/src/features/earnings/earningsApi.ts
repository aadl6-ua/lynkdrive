import { httpClient } from '../../api/http';

export type EarningsTotals = {
  bookings: number;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
};

export type EarningsVehicle = EarningsTotals & {
  vehicleId: string;
  brand: string;
  model: string;
  licensePlate: string;
  isDeleted: boolean;
};

export type EarningsBooking = {
  bookingId: string;
  vehicleId: string;
  vehicleLabel: string;
  driver: { id: string; displayName: string };
  startDatetime: string;
  endDatetime: string;
  status: 'paid_confirmed' | 'in_progress' | 'completed';
  payoutStatus: 'pending' | 'processing' | 'paid' | 'failed';
  grossAmount: number;
  platformFee: number;
  netAmount: number;
};

export type EarningsResponse = {
  currency: 'EUR';
  timeZone: string;
  mode: 'stripe' | 'prototype';
  feePercent: number;
  range: { from: string | null; to: string | null };
  summary: {
    currentMonth: EarningsTotals;
    previousMonth: EarningsTotals;
    currentYear: EarningsTotals;
    total: EarningsTotals;
  };
  rangeTotals: EarningsTotals;
  byVehicle: EarningsVehicle[];
  bookings: EarningsBooking[];
};

export async function fetchMyEarnings(range: { from?: string; to?: string } = {}): Promise<EarningsResponse> {
  const params: Record<string, string> = {};
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;

  const { data } = await httpClient.get<EarningsResponse>('/earnings/mine', { params });
  return data;
}
