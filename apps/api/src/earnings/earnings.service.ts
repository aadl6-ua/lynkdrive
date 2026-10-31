import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { PaymentsService } from '../payments/payments.service';
import {
  EarningsBookingDto,
  EarningsBookingStatus,
  EarningsResponseDto,
  EarningsTotalsDto,
  EarningsVehicleDto,
  PayoutStatus
} from './dto/earnings-response.dto';

// Solo generan ingresos las reservas pagadas (o posteriores al pago).
export const EARNING_STATUSES: EarningsBookingStatus[] = ['paid_confirmed', 'in_progress', 'completed'];

export const EARNINGS_TIME_ZONE = 'Europe/Madrid';

type EarningsRow = {
  id: string;
  vehicle_id: string;
  driver_id: string;
  start_datetime: Date;
  end_datetime: Date;
  platform_fee: string;
  total_price: string;
  status: EarningsBookingStatus;
  payout_status: PayoutStatus;
  brand: string;
  model: string;
  license_plate: string;
  vehicle_deleted_at: Date | null;
  driver_first_name: string | null;
  driver_last_name: string | null;
};

export type EarningsFilters = { from?: string; to?: string };

const monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EARNINGS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit'
});

/** Devuelve `YYYY-MM` del instante en Europe/Madrid. */
export function madridMonthKey(date: Date): string {
  const parts = monthKeyFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  return `${year}-${month}`;
}

function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

type Money = { grossCents: number; feeCents: number; netCents: number };

class TotalsAccumulator {
  bookings = 0;
  grossCents = 0;
  feeCents = 0;
  netCents = 0;

  add(money: Money): void {
    this.bookings += 1;
    this.grossCents += money.grossCents;
    this.feeCents += money.feeCents;
    this.netCents += money.netCents;
  }

  toDto(): EarningsTotalsDto {
    return {
      bookings: this.bookings,
      grossAmount: centsToAmount(this.grossCents),
      platformFee: centsToAmount(this.feeCents),
      netAmount: centsToAmount(this.netCents)
    };
  }
}

@Injectable()
export class EarningsService {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly bookingsRepository: Repository<BookingEntity>,
    private readonly paymentsService: PaymentsService
  ) {}

  async findMine(ownerId: string, filters: EarningsFilters = {}, now = new Date()): Promise<EarningsResponseDto> {
    const from = this.parseDate(filters.from, 'from');
    const to = this.parseDate(filters.to, 'to', true);

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be before to');
    }

    // Se incluyen vehiculos con soft-delete: sus ingresos historicos siguen siendo del propietario.
    const rows: EarningsRow[] = await this.bookingsRepository.query(
      `
        SELECT
          b.id,
          b.vehicle_id,
          b.driver_id,
          b.start_datetime,
          b.end_datetime,
          b.platform_fee,
          b.total_price,
          b.status,
          b.payout_status,
          v.brand,
          v.model,
          v.license_plate,
          v.deleted_at AS vehicle_deleted_at,
          u.first_name AS driver_first_name,
          u.last_name AS driver_last_name
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        LEFT JOIN users u ON u.id = b.driver_id
        WHERE v.owner_id = $1
          AND b.status = ANY($2::booking_status_enum[])
        ORDER BY b.start_datetime DESC, b.id
      `,
      [ownerId, EARNING_STATUSES]
    );

    const currentMonth = madridMonthKey(now);
    const previousMonth = previousMonthKey(currentMonth);
    const currentYear = currentMonth.slice(0, 4);

    const periods = {
      currentMonth: new TotalsAccumulator(),
      previousMonth: new TotalsAccumulator(),
      currentYear: new TotalsAccumulator(),
      total: new TotalsAccumulator()
    };
    const rangeTotals = new TotalsAccumulator();
    const vehicles = new Map<string, { info: Omit<EarningsVehicleDto, keyof EarningsTotalsDto>; totals: TotalsAccumulator }>();
    const bookings: EarningsBookingDto[] = [];

    for (const row of rows) {
      const start = new Date(row.start_datetime);
      const money = this.computeMoney(row);

      // Los periodos se imputan por la fecha de inicio del alquiler (Europe/Madrid).
      const monthKey = madridMonthKey(start);
      periods.total.add(money);
      if (monthKey === currentMonth) periods.currentMonth.add(money);
      if (monthKey === previousMonth) periods.previousMonth.add(money);
      if (monthKey.startsWith(`${currentYear}-`)) periods.currentYear.add(money);

      if ((from && start.getTime() < from.getTime()) || (to && start.getTime() > to.getTime())) {
        continue;
      }

      rangeTotals.add(money);

      let vehicle = vehicles.get(row.vehicle_id);
      if (!vehicle) {
        vehicle = {
          info: {
            vehicleId: row.vehicle_id,
            brand: row.brand,
            model: row.model,
            licensePlate: row.license_plate,
            isDeleted: row.vehicle_deleted_at !== null
          },
          totals: new TotalsAccumulator()
        };
        vehicles.set(row.vehicle_id, vehicle);
      }
      vehicle.totals.add(money);

      bookings.push({
        bookingId: row.id,
        vehicleId: row.vehicle_id,
        vehicleLabel: `${row.brand} ${row.model}`,
        driver: { id: row.driver_id, displayName: this.driverDisplayName(row) },
        startDatetime: start.toISOString(),
        endDatetime: new Date(row.end_datetime).toISOString(),
        status: row.status,
        payoutStatus: row.payout_status,
        grossAmount: centsToAmount(money.grossCents),
        platformFee: centsToAmount(money.feeCents),
        netAmount: centsToAmount(money.netCents)
      });
    }

    const byVehicle = [...vehicles.values()]
      .map(({ info, totals }) => ({ ...info, ...totals.toDto() }))
      .sort((a, b) => b.netAmount - a.netAmount || a.vehicleId.localeCompare(b.vehicleId));

    return {
      currency: 'EUR',
      timeZone: EARNINGS_TIME_ZONE,
      mode: this.paymentsService.isStripeMode() ? 'stripe' : 'prototype',
      feePercent: this.feePercent(),
      range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
      summary: {
        currentMonth: periods.currentMonth.toDto(),
        previousMonth: periods.previousMonth.toDto(),
        currentYear: periods.currentYear.toDto(),
        total: periods.total.toDto()
      },
      rangeTotals: rangeTotals.toDto(),
      byVehicle,
      bookings
    };
  }

  /**
   * Bruto = total cobrado al conductor. Comision = `platform_fee` si la reserva la congelo,
   * si no la misma `application_fee` que aplica Stripe Connect (STRIPE_APPLICATION_FEE_PERCENT).
   */
  private computeMoney(row: EarningsRow): Money {
    const grossCents = Math.round(Number(row.total_price) * 100);
    const storedFeeCents = Math.round(Number(row.platform_fee) * 100);
    const feeCents = storedFeeCents > 0 ? storedFeeCents : this.paymentsService.computeApplicationFeeCents(grossCents);
    return { grossCents, feeCents, netCents: grossCents - feeCents };
  }

  private feePercent(): number {
    return this.paymentsService.computeApplicationFeeCents(10_000) / 100;
  }

  private driverDisplayName(row: EarningsRow): string {
    const firstName = row.driver_first_name?.trim() ?? '';
    const initial = row.driver_last_name?.trim().charAt(0) ?? '';
    const name = [firstName, initial ? `${initial}.` : ''].filter(Boolean).join(' ');
    return name || 'Conductor';
  }

  /** Acepta ISO completo o `YYYY-MM-DD`; con `endOfDay` una fecha sin hora incluye todo ese dia (UTC). */
  private parseDate(value: string | undefined, field: string, endOfDay = false): Date | null {
    if (value === undefined || value === '') {
      return null;
    }

    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(isDateOnly && endOfDay ? `${value}T23:59:59.999Z` : value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date`);
    }

    return date;
  }
}
