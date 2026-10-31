export type EarningsBookingStatus = 'paid_confirmed' | 'in_progress' | 'completed';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export class EarningsTotalsDto {
  bookings!: number;
  grossAmount!: number;
  platformFee!: number;
  netAmount!: number;
}

export class EarningsSummaryDto {
  currentMonth!: EarningsTotalsDto;
  previousMonth!: EarningsTotalsDto;
  currentYear!: EarningsTotalsDto;
  total!: EarningsTotalsDto;
}

export class EarningsVehicleDto extends EarningsTotalsDto {
  vehicleId!: string;
  brand!: string;
  model!: string;
  licensePlate!: string;
  isDeleted!: boolean;
}

export class EarningsBookingDto {
  bookingId!: string;
  vehicleId!: string;
  vehicleLabel!: string;
  driver!: { id: string; displayName: string };
  startDatetime!: string;
  endDatetime!: string;
  status!: EarningsBookingStatus;
  payoutStatus!: PayoutStatus;
  grossAmount!: number;
  platformFee!: number;
  netAmount!: number;
}

export class EarningsResponseDto {
  currency!: 'EUR';
  timeZone!: string;
  mode!: 'stripe' | 'prototype';
  feePercent!: number;
  range!: { from: string | null; to: string | null };
  /** Periodos naturales (Europe/Madrid) calculados sobre todas las reservas, sin aplicar el rango. */
  summary!: EarningsSummaryDto;
  /** Totales de las reservas dentro del rango solicitado (o de todas si no hay rango). */
  rangeTotals!: EarningsTotalsDto;
  byVehicle!: EarningsVehicleDto[];
  bookings!: EarningsBookingDto[];
}
