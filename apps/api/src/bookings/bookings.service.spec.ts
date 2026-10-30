import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.type';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { VehicleAvailabilityWindowEntity } from '../vehicle-availability-windows/entities/vehicle-availability-window.entity';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { BookingsService } from './bookings.service';
import { BookingStatus } from './dto/update-booking-status.dto';
import { BookingEntity } from './entities/booking.entity';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const VEHICLE_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

function buildRow(overrides: Partial<Row> = {}): Row {
  const start = new Date(Date.now() + 7 * DAY_MS);
  const end = new Date(start.getTime() + 2 * DAY_MS);

  return {
    id: BOOKING_ID,
    vehicle_id: VEHICLE_ID,
    owner_id: OWNER_ID,
    driver_id: DRIVER_ID,
    start_datetime: start,
    end_datetime: end,
    price_per_day_at_booking: '50.00',
    platform_fee: '0.00',
    total_price: '100.00',
    status: 'pending',
    payment_intent_id: null,
    stripe_transfer_id: null,
    payout_status: 'pending',
    owner_contact_method: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRow: Row | null;
  let conflictRows: Row[];
  let executedSql: Array<{ sql: string; params: unknown[] }>;

  const bookingsRepository = { query: jest.fn() };
  const vehiclesRepository = { findOne: jest.fn() };
  const usersRepository = { findOne: jest.fn() };
  const availabilityQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn()
  };
  const availabilityRepository = { createQueryBuilder: jest.fn(() => availabilityQueryBuilder) };

  beforeEach(async () => {
    jest.clearAllMocks();
    bookingRow = buildRow();
    conflictRows = [];
    executedSql = [];

    bookingsRepository.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      executedSql.push({ sql, params });

      if (sql.includes('INSERT INTO bookings')) {
        bookingRow = buildRow({
          vehicle_id: params[0],
          driver_id: params[1],
          start_datetime: new Date(params[2] as string),
          end_datetime: new Date(params[3] as string),
          price_per_day_at_booking: String(params[4]),
          platform_fee: String(params[5]),
          total_price: String(params[6])
        });
        return [{ id: BOOKING_ID }];
      }

      if (sql.includes('UPDATE bookings')) {
        if (bookingRow && params[2] === bookingRow.id) {
          bookingRow = { ...bookingRow, status: params[0], owner_contact_method: params[1] };
        }
        return [];
      }

      if (sql.includes("status IN ('accepted', 'paid_confirmed', 'in_progress', 'completed')")) {
        return conflictRows;
      }

      if (sql.includes('WHERE b.id = $1')) {
        return bookingRow && params[0] === bookingRow.id ? [bookingRow] : [];
      }

      return [];
    });

    usersRepository.findOne.mockResolvedValue({ id: DRIVER_ID });
    vehiclesRepository.findOne.mockResolvedValue({ id: VEHICLE_ID, ownerId: OWNER_ID, pricePerDay: '45.50' });
    availabilityQueryBuilder.getOne.mockResolvedValue({ id: 'window' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(BookingEntity), useValue: bookingsRepository },
        { provide: getRepositoryToken(VehicleEntity), useValue: vehiclesRepository },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        { provide: getRepositoryToken(VehicleAvailabilityWindowEntity), useValue: availabilityRepository }
      ]
    }).compile();

    service = moduleRef.get(BookingsService);
  });

  const asUser = (sub: string): AuthUser => ({ sub, claims: { sub } });

  describe('updateStatus: maquina de estados', () => {
    const allStatuses: BookingStatus[] = [
      'pending',
      'accepted',
      'rejected',
      'paid_confirmed',
      'in_progress',
      'completed',
      'cancelled'
    ];

    const ownerAllowed: Record<BookingStatus, BookingStatus[]> = {
      pending: ['accepted', 'rejected', 'cancelled'],
      accepted: ['cancelled'],
      rejected: [],
      paid_confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed'],
      completed: [],
      cancelled: []
    };

    const driverAllowed: Record<BookingStatus, BookingStatus[]> = {
      pending: ['cancelled'],
      accepted: ['paid_confirmed', 'cancelled'],
      rejected: [],
      paid_confirmed: ['cancelled'],
      in_progress: [],
      completed: [],
      cancelled: []
    };

    const cases: Array<[string, string, BookingStatus, BookingStatus, boolean]> = [];

    for (const [role, userId, table] of [
      ['owner', OWNER_ID, ownerAllowed],
      ['driver', DRIVER_ID, driverAllowed]
    ] as const) {
      for (const from of allStatuses) {
        for (const to of allStatuses) {
          if (from === to) continue;
          cases.push([role, userId, from, to, table[from].includes(to)]);
        }
      }
    }

    it.each(cases)('%s: %s -> %s permitido=%s', async (_role, userId, from, to, allowed) => {
      bookingRow = buildRow({ status: from, owner_contact_method: 'tel: 600000000' });

      const promise = service.updateStatus(BOOKING_ID, asUser(userId), { status: to });

      if (allowed) {
        await expect(promise).resolves.toMatchObject({ id: BOOKING_ID, status: to });
      } else {
        await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('rechaza transiciones al mismo estado', async () => {
      bookingRow = buildRow({ status: 'pending' });
      await expect(
        service.updateStatus(BOOKING_ID, asUser(OWNER_ID), { status: 'pending' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza NotFound si el booking no existe', async () => {
      bookingRow = null;
      await expect(
        service.updateStatus(BOOKING_ID, asUser(OWNER_ID), { status: 'accepted' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza Forbidden si el usuario no participa en el booking', async () => {
      await expect(
        service.updateStatus(BOOKING_ID, asUser(STRANGER_ID), { status: 'cancelled' })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no permite cancelar una vez iniciada la reserva', async () => {
      bookingRow = buildRow({ status: 'accepted', start_datetime: new Date(Date.now() - 60_000) });
      await expect(
        service.updateStatus(BOOKING_ID, asUser(DRIVER_ID), { status: 'cancelled' })
      ).rejects.toThrow('Cannot cancel booking after start datetime');
    });

    it('exige ownerContactMethod al aceptar si no existe uno previo', async () => {
      await expect(
        service.updateStatus(BOOKING_ID, asUser(OWNER_ID), { status: 'accepted' })
      ).rejects.toThrow('ownerContactMethod is required');
    });

    it('guarda ownerContactMethod al aceptar', async () => {
      const result = await service.updateStatus(BOOKING_ID, asUser(OWNER_ID), {
        status: 'accepted',
        ownerContactMethod: 'whatsapp 600111222'
      });

      expect(result.status).toBe('accepted');
      expect(result.ownerContactMethod).toBe('whatsapp 600111222');
    });
  });

  describe('updateStatus: aceptacion con solicitudes solapadas', () => {
    it('rechaza automaticamente las solicitudes pending solapadas del mismo vehiculo', async () => {
      await service.updateStatus(BOOKING_ID, asUser(OWNER_ID), {
        status: 'accepted',
        ownerContactMethod: 'tel'
      });

      const rejectCall = executedSql.find(
        (call) => call.sql.includes('UPDATE bookings') && call.sql.includes("status = 'rejected'")
      );

      expect(rejectCall).toBeDefined();
      expect(rejectCall!.sql).toContain("status = 'pending'");
      expect(rejectCall!.sql).toContain('id <> $2');
      expect(rejectCall!.params).toEqual([
        VEHICLE_ID,
        BOOKING_ID,
        (bookingRow!.start_datetime as Date).toISOString(),
        (bookingRow!.end_datetime as Date).toISOString()
      ]);
    });

    it('no rechaza otras solicitudes cuando la transicion no es accepted', async () => {
      await service.updateStatus(BOOKING_ID, asUser(OWNER_ID), { status: 'rejected' });

      expect(executedSql.some((call) => call.sql.includes("status = 'rejected'"))).toBe(false);
    });

    it('impide aceptar si ya hay una reserva confirmada solapada', async () => {
      conflictRows = [{ id: 'other-booking' }];

      await expect(
        service.updateStatus(BOOKING_ID, asUser(OWNER_ID), { status: 'accepted', ownerContactMethod: 'tel' })
      ).rejects.toBeInstanceOf(ConflictException);

      expect(executedSql.some((call) => call.sql.includes('UPDATE bookings'))).toBe(false);
    });
  });

  describe('createForDriver', () => {
    const start = new Date(Date.now() + 10 * DAY_MS);

    const dto = (hours: number) => ({
      vehicleId: VEHICLE_ID,
      startDatetime: start.toISOString(),
      endDatetime: new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString()
    });

    it('congela el precio por dia del vehiculo en la reserva (snapshot)', async () => {
      const result = await service.createForDriver(DRIVER_ID, dto(48));

      const insert = executedSql.find((call) => call.sql.includes('INSERT INTO bookings'))!;
      expect(insert.params[4]).toBe(45.5);
      expect(insert.params[5]).toBe(0);
      expect(insert.params[6]).toBe(91);
      expect(insert.sql).toContain("'pending'");
      expect(result.pricePerDayAtBooking).toBe(45.5);
      expect(result.totalPrice).toBe(91);
      expect(result.status).toBe('pending');
    });

    it('redondea dias parciales hacia arriba', async () => {
      await service.createForDriver(DRIVER_ID, dto(25));
      const insert = executedSql.find((call) => call.sql.includes('INSERT INTO bookings'))!;
      expect(insert.params[6]).toBe(91);
    });

    it('cobra minimo un dia para reservas de pocas horas', async () => {
      await service.createForDriver(DRIVER_ID, dto(3));
      const insert = executedSql.find((call) => call.sql.includes('INSERT INTO bookings'))!;
      expect(insert.params[6]).toBe(45.5);
    });

    it('no usa el colchon operativo de +2h para facturar', async () => {
      await service.createForDriver(DRIVER_ID, dto(24));
      const insert = executedSql.find((call) => call.sql.includes('INSERT INTO bookings'))!;
      expect(insert.params[6]).toBe(45.5);
    });

    it('rechaza fechas invalidas', async () => {
      await expect(
        service.createForDriver(DRIVER_ID, { vehicleId: VEHICLE_ID, startDatetime: 'nope', endDatetime: 'x' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza rangos con fin anterior o igual al inicio', async () => {
      await expect(service.createForDriver(DRIVER_ID, dto(0))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('impide al propietario reservar su propio vehiculo', async () => {
      usersRepository.findOne.mockResolvedValue({ id: OWNER_ID });
      await expect(service.createForDriver(OWNER_ID, dto(24))).rejects.toThrow(
        'Owner cannot create a booking for their own vehicle'
      );
    });

    it('lanza NotFound si el vehiculo no existe', async () => {
      vehiclesRepository.findOne.mockResolvedValue(null);
      await expect(service.createForDriver(DRIVER_ID, dto(24))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFound si el usuario no existe', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      await expect(service.createForDriver(DRIVER_ID, dto(24))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza rangos fuera de las ventanas de disponibilidad', async () => {
      availabilityQueryBuilder.getOne.mockResolvedValue(null);
      await expect(service.createForDriver(DRIVER_ID, dto(24))).rejects.toThrow(
        'Requested range is outside vehicle availability windows'
      );
    });

    it('rechaza solapes con reservas confirmadas', async () => {
      conflictRows = [{ id: 'other' }];
      await expect(service.createForDriver(DRIVER_ID, dto(24))).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findByIdForUser', () => {
    it('devuelve el booking al owner y al driver', async () => {
      await expect(service.findByIdForUser(BOOKING_ID, OWNER_ID)).resolves.toMatchObject({ id: BOOKING_ID });
      await expect(service.findByIdForUser(BOOKING_ID, DRIVER_ID)).resolves.toMatchObject({ id: BOOKING_ID });
    });

    it('prohibe el acceso a terceros', async () => {
      await expect(service.findByIdForUser(BOOKING_ID, STRANGER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('convierte importes numericos de la BD a number', async () => {
      const result = await service.findByIdForUser(BOOKING_ID, OWNER_ID);
      expect(result.pricePerDayAtBooking).toBe(50);
      expect(result.totalPrice).toBe(100);
    });
  });
});
