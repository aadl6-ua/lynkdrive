import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { PaymentsService } from '../payments/payments.service';
import { EARNING_STATUSES, EarningsService, madridMonthKey } from './earnings.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_A = '44444444-4444-4444-8444-444444444444';
const VEHICLE_B = '66666666-6666-4666-8666-666666666666';

// 15 de octubre de 2026, 12:00 en Madrid.
const NOW = new Date('2026-10-15T10:00:00.000Z');

type Row = Record<string, unknown>;

let seq = 0;
function buildRow(overrides: Partial<Row> = {}): Row {
  seq += 1;
  return {
    id: `b-${seq}`,
    vehicle_id: VEHICLE_A,
    driver_id: DRIVER_ID,
    start_datetime: new Date('2026-10-10T08:00:00.000Z'),
    end_datetime: new Date('2026-10-12T08:00:00.000Z'),
    platform_fee: '0.00',
    total_price: '100.00',
    status: 'completed',
    payout_status: 'pending',
    brand: 'Toyota',
    model: 'Corolla',
    license_plate: '1234ABC',
    vehicle_deleted_at: null,
    driver_first_name: 'Diego',
    driver_last_name: 'Driver',
    ...overrides
  };
}

describe('EarningsService', () => {
  let service: EarningsService;
  let rows: Row[];

  const query = jest.fn(async () => rows);
  const paymentsService = {
    isStripeMode: jest.fn(() => false),
    computeApplicationFeeCents: jest.fn((cents: number) => Math.round(cents * 0.1))
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rows = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        EarningsService,
        { provide: getRepositoryToken(BookingEntity), useValue: { query } },
        { provide: PaymentsService, useValue: paymentsService }
      ]
    }).compile();

    service = moduleRef.get(EarningsService);
  });

  it('filtra por propietario y solo estados que generan ingresos', async () => {
    await service.findMine(OWNER_ID, {}, NOW);

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('v.owner_id = $1');
    expect(params).toEqual([OWNER_ID, EARNING_STATUSES]);
    expect(EARNING_STATUSES).toEqual(['paid_confirmed', 'in_progress', 'completed']);
  });

  it('devuelve todo a cero sin reservas', async () => {
    const res = await service.findMine(OWNER_ID, {}, NOW);

    expect(res.summary.total).toEqual({ bookings: 0, grossAmount: 0, platformFee: 0, netAmount: 0 });
    expect(res.byVehicle).toEqual([]);
    expect(res.bookings).toEqual([]);
    expect(res).toMatchObject({ currency: 'EUR', mode: 'prototype', feePercent: 10, timeZone: 'Europe/Madrid' });
  });

  it('calcula bruto, comision y neto con el porcentaje de Stripe cuando platform_fee es 0', async () => {
    rows = [buildRow({ total_price: '123.45' })];

    const res = await service.findMine(OWNER_ID, {}, NOW);

    expect(res.bookings[0]).toMatchObject({ grossAmount: 123.45, platformFee: 12.35, netAmount: 111.1 });
    expect(res.bookings[0].driver.displayName).toBe('Diego D.');
  });

  it('respeta platform_fee congelado en la reserva si es mayor que 0', async () => {
    rows = [buildRow({ total_price: '100.00', platform_fee: '5.00' })];

    const res = await service.findMine(OWNER_ID, {}, NOW);

    expect(res.bookings[0]).toMatchObject({ grossAmount: 100, platformFee: 5, netAmount: 95 });
  });

  it('agrupa por periodos naturales de Europe/Madrid', async () => {
    rows = [
      buildRow({ start_datetime: new Date('2026-10-10T08:00:00.000Z') }), // mes actual
      // 30 sep 22:30 UTC = 1 oct 00:30 Madrid -> mes actual
      buildRow({ start_datetime: new Date('2026-09-30T22:30:00.000Z') }),
      buildRow({ start_datetime: new Date('2026-09-05T08:00:00.000Z') }), // mes anterior
      buildRow({ start_datetime: new Date('2026-02-05T08:00:00.000Z') }), // este anio
      buildRow({ start_datetime: new Date('2025-12-20T08:00:00.000Z') }) // anio anterior
    ];

    const res = await service.findMine(OWNER_ID, {}, NOW);

    expect(res.summary.currentMonth).toEqual({ bookings: 2, grossAmount: 200, platformFee: 20, netAmount: 180 });
    expect(res.summary.previousMonth.bookings).toBe(1);
    expect(res.summary.currentYear.bookings).toBe(4);
    expect(res.summary.total.bookings).toBe(5);
  });

  it('el mes anterior a enero es diciembre del anio pasado', async () => {
    rows = [buildRow({ start_datetime: new Date('2025-12-20T08:00:00.000Z') })];

    const res = await service.findMine(OWNER_ID, {}, new Date('2026-01-10T10:00:00.000Z'));

    expect(res.summary.previousMonth.bookings).toBe(1);
    expect(res.summary.currentYear.bookings).toBe(0);
  });

  it('desglosa por vehiculo ordenado por neto y marca vehiculos borrados', async () => {
    rows = [
      buildRow({ vehicle_id: VEHICLE_A, total_price: '50.00' }),
      buildRow({
        vehicle_id: VEHICLE_B,
        brand: 'Seat',
        model: 'Ibiza',
        license_plate: '9999ZZZ',
        total_price: '200.00',
        vehicle_deleted_at: new Date()
      }),
      buildRow({ vehicle_id: VEHICLE_A, total_price: '70.00' })
    ];

    const res = await service.findMine(OWNER_ID, {}, NOW);

    expect(res.byVehicle).toHaveLength(2);
    expect(res.byVehicle[0]).toMatchObject({ vehicleId: VEHICLE_B, isDeleted: true, bookings: 1, netAmount: 180 });
    expect(res.byVehicle[1]).toMatchObject({ vehicleId: VEHICLE_A, isDeleted: false, bookings: 2, grossAmount: 120 });
  });

  it('aplica el rango a desglose e historial pero no a los periodos', async () => {
    rows = [
      buildRow({ start_datetime: new Date('2026-10-10T08:00:00.000Z') }),
      buildRow({ start_datetime: new Date('2026-09-05T08:00:00.000Z') })
    ];

    const res = await service.findMine(OWNER_ID, { from: '2026-10-01', to: '2026-10-10' }, NOW);

    expect(res.bookings).toHaveLength(1);
    expect(res.rangeTotals.bookings).toBe(1);
    expect(res.byVehicle[0].bookings).toBe(1);
    expect(res.summary.total.bookings).toBe(2);
    // `to` sin hora incluye el dia completo.
    expect(res.range.to).toBe('2026-10-10T23:59:59.999Z');
  });

  it('rechaza fechas invalidas o rango invertido', async () => {
    await expect(service.findMine(OWNER_ID, { from: 'ayer' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.findMine(OWNER_ID, { from: '2026-10-10', to: '2026-10-01' }, NOW)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('usa un nombre generico si el conductor esta anonimizado', async () => {
    rows = [buildRow({ driver_first_name: null, driver_last_name: null })];

    const res = await service.findMine(OWNER_ID, {}, NOW);

    expect(res.bookings[0].driver.displayName).toBe('Conductor');
  });

  it('madridMonthKey usa la zona horaria de Madrid', () => {
    expect(madridMonthKey(new Date('2026-12-31T23:30:00.000Z'))).toBe('2027-01');
  });
});
