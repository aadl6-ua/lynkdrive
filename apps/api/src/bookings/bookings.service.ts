import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AuthUser } from 'src/auth/auth-user.type';
import { HANDOVER_BUFFER_HOURS } from '../common/booking-rules';
import { BookingEmailEvent, BookingNotificationsService } from '../notifications/booking-notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { BookingPushEvent, PushNotificationsService } from '../push-notifications/push-notifications.service';
import { UserEntity } from '../users/entities/user.entity';
import { VehicleAvailabilityWindowEntity } from '../vehicle-availability-windows/entities/vehicle-availability-window.entity';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus, UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { BookingEntity } from './entities/booking.entity';

// Colchon operativo (entrega/recogida) que cada reserva bloquea tras su fin real.
export { HANDOVER_BUFFER_HOURS };

const BLOCKING_STATUSES_SQL = `'accepted', 'paid_confirmed', 'in_progress', 'completed'`;

type BookingRow = {
  id: string;
  vehicle_id: string;
  owner_id: string;
  driver_id: string;
  start_datetime: Date;
  end_datetime: Date;
  price_per_day_at_booking: string;
  platform_fee: string;
  total_price: string;
  status: BookingStatus;
  payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  payout_status: 'pending' | 'processing' | 'paid' | 'failed';
  owner_contact_method: string | null;
  created_at: Date;
  updated_at: Date;
};

type VehicleBookingSlotDto = Pick<
  BookingResponseDto,
  'id' | 'vehicleId' | 'startDatetime' | 'endDatetime' | 'status'
>;

// Estados que generan email al cambiar por PUT /status (accepted y paid_confirmed se notifican aparte).
const EMAIL_EVENTS: BookingEmailEvent[] = ['rejected', 'paid_confirmed', 'completed', 'cancelled'];
// Estados que generan push al cambiar por PUT /status (accepted se notifica aparte).
const PUSH_EVENTS: BookingPushEvent[] = ['rejected', 'paid_confirmed', 'in_progress', 'completed', 'cancelled'];

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly bookingsRepository: Repository<BookingEntity>,
    @InjectRepository(VehicleEntity)
    private readonly vehiclesRepository: Repository<VehicleEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(VehicleAvailabilityWindowEntity)
    private readonly availabilityRepository: Repository<VehicleAvailabilityWindowEntity>,
    private readonly paymentsService: PaymentsService,
    @Optional() private readonly notifications?: BookingNotificationsService,
    @Optional() private readonly push?: PushNotificationsService
  ) {}

  async findMineAsDriver(userId: string): Promise<BookingResponseDto[]> {
    const rows = await this.bookingsRepository.query(
      `
        SELECT
          b.id,
          b.vehicle_id,
          v.owner_id,
          b.driver_id,
          b.start_datetime,
          b.end_datetime,
          b.price_per_day_at_booking,
          b.platform_fee,
          b.total_price,
          b.status,
          b.payment_intent_id,
          b.stripe_transfer_id,
          b.payout_status,
          b.owner_contact_method,
          b.created_at,
          b.updated_at
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE b.driver_id = $1
        ORDER BY b.created_at DESC
      `,
      [userId]
    );

    return rows.map((row: BookingRow) => this.toResponseDto(row));
  }

  async findMineAsOwner(userId: string): Promise<BookingResponseDto[]> {
    const rows = await this.bookingsRepository.query(
      `
        SELECT
          b.id,
          b.vehicle_id,
          v.owner_id,
          b.driver_id,
          b.start_datetime,
          b.end_datetime,
          b.price_per_day_at_booking,
          b.platform_fee,
          b.total_price,
          b.status,
          b.payment_intent_id,
          b.stripe_transfer_id,
          b.payout_status,
          b.owner_contact_method,
          b.created_at,
          b.updated_at
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE v.owner_id = $1
        ORDER BY b.created_at DESC
      `,
      [userId]
    );

    return rows.map((row: BookingRow) => this.toResponseDto(row));
  }

  async findByVehicleId(vehicleId: string): Promise<BookingResponseDto[]> {
    await this.ensureVehicleExists(vehicleId);

    const rows = await this.bookingsRepository.query(
      `
        SELECT
          b.id,
          b.vehicle_id,
          v.owner_id,
          b.driver_id,
          b.start_datetime,
          b.end_datetime,
          b.price_per_day_at_booking,
          b.platform_fee,
          b.total_price,
          b.status,
          b.payment_intent_id,
          b.stripe_transfer_id,
          b.payout_status,
          b.owner_contact_method,
          b.created_at,
          b.updated_at
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE b.vehicle_id = $1
        ORDER BY b.start_datetime ASC
      `,
      [vehicleId]
    );

    return rows.map((row: BookingRow) => this.toResponseDto(row));
  }

  // Terceros solo ven la ocupacion (fechas y estado); el detalle completo queda para los participantes.
  async findByVehicleIdForUser(
    vehicleId: string,
    userId: string
  ): Promise<Array<BookingResponseDto | VehicleBookingSlotDto>> {
    const bookings = await this.findByVehicleId(vehicleId);

    return bookings.map((booking) =>
      booking.ownerId === userId || booking.driverId === userId
        ? booking
        : {
            id: booking.id,
            vehicleId: booking.vehicleId,
            startDatetime: booking.startDatetime,
            endDatetime: booking.endDatetime,
            status: booking.status
          }
    );
  }

  async findByIdForUser(id: string, userId: string): Promise<BookingResponseDto> {
    const row = await this.findBookingRowById(id);

    if (!row) {
      throw new NotFoundException(`Booking ${id} not found`);
    }

    if (row.driver_id !== userId && row.owner_id !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return this.toResponseDto(row);
  }

  async createForDriver(driverId: string, createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    await this.ensureVerifiedDriver(driverId);

    const startDatetime = this.parseDateOrThrow(createBookingDto.startDatetime, 'startDatetime');
    const endDatetime = this.parseDateOrThrow(createBookingDto.endDatetime, 'endDatetime');

    this.validateDateRange(startDatetime, endDatetime);

    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: createBookingDto.vehicleId, deletedAt: IsNull() },
      select: { id: true, ownerId: true, pricePerDay: true, status: true }
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${createBookingDto.vehicleId} not found`);
    }

    if (vehicle.status !== 'active') {
      throw new BadRequestException('Este vehículo no admite reservas ahora mismo');
    }

    if (vehicle.ownerId === driverId) {
      throw new BadRequestException('Owner cannot create a booking for their own vehicle');
    }

    await this.ensureInsideAvailabilityWindow(vehicle.id, startDatetime, endDatetime);
    await this.ensureNoConflicts(vehicle.id, startDatetime, endDatetime);

    const days = this.calculateBookedDays(startDatetime, endDatetime);
    const pricePerDay = Number(vehicle.pricePerDay);
    const platformFee = 0;
    const totalPrice = this.roundMoney(days * pricePerDay + platformFee);

    const rows = await this.bookingsRepository.query(
      `
        INSERT INTO bookings (
          vehicle_id,
          driver_id,
          start_datetime,
          end_datetime,
          price_per_day_at_booking,
          platform_fee,
          total_price,
          status,
          payout_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'pending')
        RETURNING id
      `,
      [vehicle.id, driverId, startDatetime.toISOString(), endDatetime.toISOString(), pricePerDay, platformFee, totalPrice]
    );

    const createdId = rows[0]?.id as string | undefined;

    if (!createdId) {
      throw new ConflictException('Booking could not be created');
    }

    this.notifications?.notify('requested', createdId);
    this.push?.notify('requested', createdId);

    return this.findByIdForUser(createdId, driverId);
  }

  async updateStatus(id: string, user: AuthUser, updateStatusDto: UpdateBookingStatusDto): Promise<BookingResponseDto> {
    const row = await this.findBookingRowById(id);

    if (!row) {
      throw new NotFoundException(`Booking ${id} not found`);
    }

    const isOwner = row.owner_id === user.sub;
    const isDriver = row.driver_id === user.sub;

    if (!isOwner && !isDriver) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    const role = isOwner ? 'owner' : 'driver';
    this.validateStatusTransition(role, row.status, updateStatusDto.status, row.start_datetime);

    if (row.status === updateStatusDto.status) {
      return this.toResponseDto(row);
    }

    const shouldSetOwnerContact =
      role === 'owner' && updateStatusDto.status === 'accepted' && !!updateStatusDto.ownerContactMethod;

    const shouldKeepOwnerContact =
      role === 'owner' && updateStatusDto.status === 'accepted' && !updateStatusDto.ownerContactMethod;

    if (role === 'owner' && updateStatusDto.status === 'accepted' && shouldKeepOwnerContact && !row.owner_contact_method) {
      throw new BadRequestException('ownerContactMethod is required when accepting a booking');
    }

    if (role === 'driver' && updateStatusDto.status === 'paid_confirmed' && this.paymentsService.isStripeMode()) {
      // Con Stripe activo el pago solo se confirma vía /payments (webhook o confirm verificado).
      throw new BadRequestException('Payment must be completed through Stripe (/payments) in stripe mode');
    }

    // Máquina de estados: el viaje empieza tras el check-in y termina tras el check-out.
    const requiredChecklist =
      updateStatusDto.status === 'in_progress' ? 'check_in' : updateStatusDto.status === 'completed' ? 'check_out' : null;

    if (requiredChecklist) {
      const checklistRows = await this.bookingsRepository.query(
        `SELECT 1 FROM booking_checklists WHERE booking_id = $1 AND type = $2 LIMIT 1`,
        [id, requiredChecklist]
      );

      if (!checklistRows[0]) {
        throw new BadRequestException(
          requiredChecklist === 'check_in'
            ? 'Falta el checklist de entrega (check-in) para iniciar el viaje'
            : 'Falta el checklist de devolución (check-out) para completar el viaje'
        );
      }
    }

    if (updateStatusDto.status === 'cancelled' && row.status === 'paid_confirmed') {
      // Reembolso antes de cancelar: si Stripe falla, la reserva no se cancela.
      await this.paymentsService.refundBookingOnCancellation(id, role);
    }

    const nextOwnerContactMethod = shouldSetOwnerContact
      ? updateStatusDto.ownerContactMethod
      : row.owner_contact_method;

    if (role === 'owner' && updateStatusDto.status === 'accepted') {
      const autoRejectedIds = await this.acceptAtomically(row, nextOwnerContactMethod ?? null);
      this.notifications?.notify('accepted', id);
      autoRejectedIds.forEach((rejectedId) => this.notifications?.notify('rejected', rejectedId));
      this.push?.notify('accepted', id);
      autoRejectedIds.forEach((rejectedId) => this.push?.notify('rejected', rejectedId));
      return this.findByIdForUser(id, user.sub);
    }

    await this.bookingsRepository.query(
      `
        UPDATE bookings
        SET
          status = $1,
          owner_contact_method = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `,
      [updateStatusDto.status, nextOwnerContactMethod ?? null, id]
    );

    if (EMAIL_EVENTS.includes(updateStatusDto.status as BookingEmailEvent)) {
      this.notifications?.notify(updateStatusDto.status as BookingEmailEvent, id, user.sub);
    }

    if (PUSH_EVENTS.includes(updateStatusDto.status as BookingPushEvent)) {
      this.push?.notify(updateStatusDto.status as BookingPushEvent, id, user.sub);
    }

    return this.findByIdForUser(id, user.sub);
  }

  // Acepta una solicitud y rechaza las pending solapadas del mismo vehiculo en una unica transaccion.
  // Se bloquea la fila del vehiculo para serializar aceptaciones concurrentes sobre el mismo coche.
  // Devuelve los ids de las solicitudes pending rechazadas automáticamente.
  private async acceptAtomically(row: BookingRow, ownerContactMethod: string | null): Promise<string[]> {
    return this.bookingsRepository.manager.transaction(async (manager: EntityManager) => {
      await manager.query(`SELECT id FROM vehicles WHERE id = $1 FOR UPDATE`, [row.vehicle_id]);

      const locked = await manager.query(
        `SELECT status, start_datetime, end_datetime FROM bookings WHERE id = $1 FOR UPDATE`,
        [row.id]
      );
      const current = locked[0] as Pick<BookingRow, 'status' | 'start_datetime' | 'end_datetime'> | undefined;

      if (!current || current.status !== 'pending') {
        throw new ConflictException('Booking is no longer pending');
      }

      await this.ensureNoConflicts(
        row.vehicle_id,
        new Date(current.start_datetime),
        new Date(current.end_datetime),
        row.id,
        manager
      );

      await manager.query(
        `
          UPDATE bookings
          SET status = 'accepted', owner_contact_method = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
        [row.id, ownerContactMethod]
      );

      const rejected = await manager.query(
        `
          UPDATE bookings
          SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
          WHERE vehicle_id = $1
            AND id <> $2
            AND status = 'pending'
            AND start_datetime < $4::timestamptz + make_interval(hours => $5)
            AND end_datetime + make_interval(hours => $5) > $3::timestamptz
          RETURNING id
        `,
        [
          row.vehicle_id,
          row.id,
          new Date(current.start_datetime).toISOString(),
          new Date(current.end_datetime).toISOString(),
          HANDOVER_BUFFER_HOURS
        ]
      );

      // UPDATE ... RETURNING con query() devuelve [filas, recuento] en pg.
      const rejectedRows = (Array.isArray(rejected?.[0]) ? rejected[0] : rejected) as Array<{ id: string }> | undefined;
      return (rejectedRows ?? []).map((item) => item.id).filter(Boolean);
    });
  }

  private async findBookingRowById(id: string): Promise<BookingRow | null> {
    const rows = await this.bookingsRepository.query(
      `
        SELECT
          b.id,
          b.vehicle_id,
          v.owner_id,
          b.driver_id,
          b.start_datetime,
          b.end_datetime,
          b.price_per_day_at_booking,
          b.platform_fee,
          b.total_price,
          b.status,
          b.payment_intent_id,
          b.stripe_transfer_id,
          b.payout_status,
          b.owner_contact_method,
          b.created_at,
          b.updated_at
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE b.id = $1
        LIMIT 1
      `,
      [id]
    );

    return (rows[0] as BookingRow | undefined) ?? null;
  }

  // La app ya bloquea la solicitud sin verificación; aquí se aplica la misma regla en servidor.
  private async ensureVerifiedDriver(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
      select: { id: true, isVerified: true }
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Tu documentación debe estar verificada para solicitar reservas');
    }
  }

  private async ensureVehicleExists(vehicleId: string): Promise<void> {
    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: vehicleId, deletedAt: IsNull() },
      select: { id: true }
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }
  }

  private async ensureInsideAvailabilityWindow(
    vehicleId: string,
    startDatetime: Date,
    endDatetime: Date
  ): Promise<void> {
    const matchingWindow = await this.availabilityRepository
      .createQueryBuilder('w')
      .where('w.vehicleId = :vehicleId', { vehicleId })
      .andWhere('w.startDatetime <= :startDatetime', { startDatetime: startDatetime.toISOString() })
      .andWhere('w.endDatetime >= :endDatetime', { endDatetime: endDatetime.toISOString() })
      .getOne();

    if (!matchingWindow) {
      throw new BadRequestException('Requested range is outside vehicle availability windows');
    }
  }

  // Dos reservas chocan si [inicio, fin + colchon] de una se solapa con [inicio, fin + colchon] de la otra.
  private async ensureNoConflicts(
    vehicleId: string,
    startDatetime: Date,
    endDatetime: Date,
    excludeBookingId?: string,
    manager?: EntityManager
  ): Promise<void> {
    const runner = manager ?? this.bookingsRepository;
    const rows = await runner.query(
      `
        SELECT id
        FROM bookings
        WHERE vehicle_id = $1
          AND status IN (${BLOCKING_STATUSES_SQL})
          AND ($4::uuid IS NULL OR id <> $4::uuid)
          AND start_datetime < $3::timestamptz + make_interval(hours => $5)
          AND end_datetime + make_interval(hours => $5) > $2::timestamptz
        LIMIT 1
      `,
      [
        vehicleId,
        startDatetime.toISOString(),
        endDatetime.toISOString(),
        excludeBookingId ?? null,
        HANDOVER_BUFFER_HOURS
      ]
    );

    if (rows[0]?.id) {
      throw new ConflictException(
        `There is already a booking that overlaps with the requested range (including the ${HANDOVER_BUFFER_HOURS}h hand-over buffer)`
      );
    }
  }

  private parseDateOrThrow(value: string, fieldName: string): Date {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO datetime`);
    }

    return parsedDate;
  }

  private validateDateRange(startDatetime: Date, endDatetime: Date): void {
    if (endDatetime <= startDatetime) {
      throw new BadRequestException('endDatetime must be greater than startDatetime');
    }
  }

  private calculateBookedDays(startDatetime: Date, endDatetime: Date): number {
    const ms = endDatetime.getTime() - startDatetime.getTime();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return Math.max(1, days);
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private validateStatusTransition(
    role: 'owner' | 'driver',
    currentStatus: BookingStatus,
    nextStatus: BookingStatus,
    bookingStartDatetime: Date
  ): void {
    if (role === 'owner') {
      const allowedOwnerTransitions: Record<BookingStatus, BookingStatus[]> = {
        pending: ['accepted', 'rejected', 'cancelled'],
        accepted: ['cancelled'],
        rejected: [],
        paid_confirmed: ['in_progress', 'cancelled'],
        in_progress: ['completed'],
        completed: [],
        cancelled: []
      };

      if (!allowedOwnerTransitions[currentStatus].includes(nextStatus)) {
        throw new BadRequestException(
          `Invalid status transition for owner: ${currentStatus} -> ${nextStatus}`
        );
      }
    }

    if (role === 'driver') {
      const allowedDriverTransitions: Record<BookingStatus, BookingStatus[]> = {
        pending: ['cancelled'],
        accepted: ['paid_confirmed', 'cancelled'],
        rejected: [],
        paid_confirmed: ['cancelled'],
        in_progress: [],
        completed: [],
        cancelled: []
      };

      if (!allowedDriverTransitions[currentStatus].includes(nextStatus)) {
        throw new BadRequestException(
          `Invalid status transition for driver: ${currentStatus} -> ${nextStatus}`
        );
      }
    }

    const now = Date.now();
    const bookingStart = new Date(bookingStartDatetime).getTime();

    if (nextStatus === 'cancelled' && bookingStart <= now) {
      throw new BadRequestException('Cannot cancel booking after start datetime');
    }
  }

  private toResponseDto(row: BookingRow): BookingResponseDto {
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      ownerId: row.owner_id,
      driverId: row.driver_id,
      startDatetime: new Date(row.start_datetime),
      endDatetime: new Date(row.end_datetime),
      pricePerDayAtBooking: Number(row.price_per_day_at_booking),
      platformFee: Number(row.platform_fee),
      totalPrice: Number(row.total_price),
      status: row.status,
      paymentIntentId: row.payment_intent_id,
      stripeTransferId: row.stripe_transfer_id,
      payoutStatus: row.payout_status,
      ownerContactMethod: row.owner_contact_method,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
