import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { forgetBlockStatus } from 'src/auth/supabase-jwt-auth.guard';
import { getSupabaseAdminClient, parseStorageReference, resolveFileUrl } from 'src/common/supabase-storage';
import { SetBlockedDto, SetReviewVisibilityDto } from './dto/admin-actions.dto';
import {
  AdminBookingsQueryDto,
  AdminIncidentsQueryDto,
  AdminReviewsQueryDto,
  AdminUsersQueryDto,
  AdminVehiclesQueryDto,
  PaginationQueryDto
} from './dto/admin-query.dto';
import { CreateIncidentDto, IncidentStatus } from './dto/incident.dto';

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

type Row = Record<string, unknown>;

// Estados en los que el cobro al conductor ya se ha producido.
const PAID_STATUSES = ['paid_confirmed', 'in_progress', 'completed'];
// Duración del baneo en Supabase Auth al bloquear (equivale a indefinido).
const SUPABASE_BAN_DURATION = '876000h';

const USER_COLUMNS = `
  u.id, au.email, u.first_name, u.last_name, u.phone_number, u.avatar_url,
  u.id_document_url, u.driver_license_url, u.is_verified, u.is_admin,
  u.blocked_at, u.blocked_reason, u.stripe_account_id, u.created_at, u.deleted_at`;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly dataSource: DataSource) {}

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async getDashboard() {
    const [users, vehicles, bookings, revenue, monthly, moderation] = await Promise.all([
      this.dataSource.query(
        `SELECT
           COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
           COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_verified) AS verified,
           COUNT(*) FILTER (WHERE deleted_at IS NULL AND NOT is_verified
             AND id_document_url IS NOT NULL AND driver_license_url IS NOT NULL) AS pending_verification,
           COUNT(*) FILTER (WHERE deleted_at IS NULL AND blocked_at IS NOT NULL) AS blocked,
           COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days') AS new_last_30_days
         FROM users`
      ),
      this.dataSource.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'active') AS active,
           COUNT(*) FILTER (WHERE status = 'inactive') AS inactive
         FROM vehicles WHERE deleted_at IS NULL`
      ),
      this.dataSource.query(`SELECT status, COUNT(*) AS count FROM bookings GROUP BY status`),
      this.dataSource.query(
        `SELECT
           COALESCE(SUM(total_price), 0) AS gross,
           COALESCE(SUM(total_price) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS gross_last_30_days,
           COUNT(*) AS paid_bookings
         FROM bookings WHERE status = ANY($1::booking_status_enum[])`,
        [PAID_STATUSES]
      ),
      this.dataSource.query(
        `SELECT to_char(m.month, 'YYYY-MM') AS month, COALESCE(SUM(b.total_price), 0) AS gross, COUNT(b.id) AS bookings
         FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months', date_trunc('month', NOW()), INTERVAL '1 month') AS m(month)
         LEFT JOIN bookings b
           ON date_trunc('month', b.created_at) = m.month AND b.status = ANY($1::booking_status_enum[])
         GROUP BY m.month ORDER BY m.month`,
        [PAID_STATUSES]
      ),
      this.dataSource.query(
        `SELECT
           (SELECT COUNT(*) FROM incidents WHERE status IN ('open', 'in_progress')) AS open_incidents,
           (SELECT COUNT(*) FROM reviews WHERE hidden_at IS NOT NULL) AS hidden_reviews`
      )
    ]);

    const feePercent = this.applicationFeePercent();
    const gross = Number(revenue[0]?.gross ?? 0);
    const grossLast30 = Number(revenue[0]?.gross_last_30_days ?? 0);
    const byStatus = Object.fromEntries(
      (bookings as Row[]).map((row) => [String(row.status), Number(row.count)])
    ) as Record<string, number>;

    return {
      users: {
        total: Number(users[0]?.total ?? 0),
        verified: Number(users[0]?.verified ?? 0),
        pendingVerification: Number(users[0]?.pending_verification ?? 0),
        blocked: Number(users[0]?.blocked ?? 0),
        newLast30Days: Number(users[0]?.new_last_30_days ?? 0)
      },
      vehicles: {
        total: Number(vehicles[0]?.total ?? 0),
        active: Number(vehicles[0]?.active ?? 0),
        inactive: Number(vehicles[0]?.inactive ?? 0)
      },
      bookings: {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        byStatus
      },
      revenue: {
        currency: 'EUR',
        gross: this.round(gross),
        grossLast30Days: this.round(grossLast30),
        platformFeePercent: feePercent,
        estimatedPlatformFees: this.round((gross * feePercent) / 100),
        paidBookings: Number(revenue[0]?.paid_bookings ?? 0),
        monthly: (monthly as Row[]).map((row) => ({
          month: String(row.month),
          gross: this.round(Number(row.gross)),
          bookings: Number(row.bookings)
        }))
      },
      moderation: {
        openIncidents: Number(moderation[0]?.open_incidents ?? 0),
        hiddenReviews: Number(moderation[0]?.hidden_reviews ?? 0)
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Usuarios
  // ---------------------------------------------------------------------------

  async listUsers(query: AdminUsersQueryDto) {
    const where: string[] = ['u.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (query.search?.trim()) {
      params.push(`%${this.escapeLike(query.search.trim())}%`);
      const p = `$${params.length}`;
      where.push(
        `(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p} OR u.phone_number ILIKE ${p} OR au.email ILIKE ${p} OR u.id::text = $${params.length + 1})`
      );
      params.push(query.search.trim());
    }

    switch (query.filter) {
      case 'pending_verification':
        where.push('NOT u.is_verified AND u.id_document_url IS NOT NULL AND u.driver_license_url IS NOT NULL');
        break;
      case 'verified':
        where.push('u.is_verified');
        break;
      case 'blocked':
        where.push('u.blocked_at IS NOT NULL');
        break;
      case 'admins':
        where.push('u.is_admin');
        break;
    }

    const from = `FROM users u LEFT JOIN auth.users au ON au.id = u.id WHERE ${where.join(' AND ')}`;

    return this.paginate(
      `SELECT ${USER_COLUMNS} ${from} ORDER BY u.created_at DESC`,
      `SELECT COUNT(*) AS total ${from}`,
      params,
      query,
      (row) => this.toUser(row)
    );
  }

  async getUser(id: string) {
    const rows = await this.dataSource.query(
      `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN auth.users au ON au.id = u.id WHERE u.id = $1 LIMIT 1`,
      [id]
    );

    if (!rows[0]) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const row = rows[0] as Row;
    const [stats, idDocument, driverLicense, avatar] = await Promise.all([
      this.dataSource.query(
        `SELECT
           (SELECT COUNT(*) FROM vehicles WHERE owner_id = $1 AND deleted_at IS NULL) AS vehicles,
           (SELECT COUNT(*) FROM bookings WHERE driver_id = $1) AS bookings_as_driver,
           (SELECT COUNT(*) FROM bookings b INNER JOIN vehicles v ON v.id = b.vehicle_id WHERE v.owner_id = $1) AS bookings_as_owner,
           (SELECT COUNT(*) FROM reviews WHERE reviewee_id = $1 AND hidden_at IS NULL) AS reviews_received,
           (SELECT AVG(rating) FROM reviews WHERE reviewee_id = $1 AND hidden_at IS NULL) AS average_rating,
           (SELECT COUNT(*) FROM incidents WHERE user_id = $1) AS incidents`,
        [id]
      ),
      resolveFileUrl(row.id_document_url as string | null),
      resolveFileUrl(row.driver_license_url as string | null),
      resolveFileUrl(row.avatar_url as string | null)
    ]);

    const stat = (stats[0] ?? {}) as Row;

    return {
      ...this.toUser(row),
      avatar,
      documents: { idDocument, driverLicense },
      stats: {
        vehicles: Number(stat.vehicles ?? 0),
        bookingsAsDriver: Number(stat.bookings_as_driver ?? 0),
        bookingsAsOwner: Number(stat.bookings_as_owner ?? 0),
        reviewsReceived: Number(stat.reviews_received ?? 0),
        averageRating: stat.average_rating === null || stat.average_rating === undefined ? null : Number(stat.average_rating),
        incidents: Number(stat.incidents ?? 0)
      }
    };
  }

  async setVerification(id: string, isVerified: boolean) {
    await this.updateActiveUser(id, `UPDATE users SET is_verified = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [
      id,
      isVerified
    ]);
    return this.getUser(id);
  }

  async setBlocked(adminId: string, id: string, dto: SetBlockedDto) {
    if (dto.blocked && adminId === id) {
      throw new BadRequestException('No puedes bloquear tu propia cuenta');
    }

    await this.updateActiveUser(
      id,
      dto.blocked
        ? `UPDATE users SET blocked_at = COALESCE(blocked_at, NOW()), blocked_reason = $2
           WHERE id = $1 AND deleted_at IS NULL RETURNING id`
        : `UPDATE users SET blocked_at = NULL, blocked_reason = NULL WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      dto.blocked ? [id, dto.reason?.trim() || null] : [id]
    );

    forgetBlockStatus(id);
    await this.syncSupabaseBan(id, dto.blocked);

    return this.getUser(id);
  }

  // ---------------------------------------------------------------------------
  // Vehículos
  // ---------------------------------------------------------------------------

  async listVehicles(query: AdminVehiclesQueryDto) {
    const where: string[] = ['v.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (query.search?.trim()) {
      params.push(`%${this.escapeLike(query.search.trim())}%`);
      const p = `$${params.length}`;
      where.push(`(v.brand ILIKE ${p} OR v.model ILIKE ${p} OR v.license_plate ILIKE ${p} OR v.location_address ILIKE ${p})`);
    }

    if (query.status) {
      params.push(query.status);
      where.push(`v.status = $${params.length}`);
    }

    const from = `FROM vehicles v INNER JOIN users u ON u.id = v.owner_id WHERE ${where.join(' AND ')}`;

    return this.paginate(
      `SELECT v.id, v.brand, v.model, v.year, v.license_plate, v.price_per_day, v.location_address, v.status,
              v.created_at, v.owner_id, u.first_name AS owner_first_name, u.last_name AS owner_last_name,
              (SELECT image_url FROM vehicle_images vi WHERE vi.vehicle_id = v.id
               ORDER BY vi.is_primary DESC, vi.created_at ASC LIMIT 1) AS primary_image_url,
              (SELECT COUNT(*) FROM bookings b WHERE b.vehicle_id = v.id) AS bookings
       ${from} ORDER BY v.created_at DESC`,
      `SELECT COUNT(*) AS total ${from}`,
      params,
      query,
      (row) => this.toVehicle(row)
    );
  }

  async setVehicleStatus(id: string, status: 'active' | 'inactive') {
    const rows = await this.dataSource.query(
      `UPDATE vehicles SET status = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, status]
    );

    if (!this.firstReturned(rows)) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }

    const result = await this.dataSource.query(
      `SELECT v.id, v.brand, v.model, v.year, v.license_plate, v.price_per_day, v.location_address, v.status,
              v.created_at, v.owner_id, u.first_name AS owner_first_name, u.last_name AS owner_last_name,
              NULL AS primary_image_url, (SELECT COUNT(*) FROM bookings b WHERE b.vehicle_id = v.id) AS bookings
       FROM vehicles v INNER JOIN users u ON u.id = v.owner_id WHERE v.id = $1`,
      [id]
    );

    return this.toVehicle(result[0] as Row);
  }

  // ---------------------------------------------------------------------------
  // Reseñas
  // ---------------------------------------------------------------------------

  async listReviews(query: AdminReviewsQueryDto) {
    const where: string[] = ['TRUE'];
    const params: unknown[] = [];

    if (query.visibility === 'hidden') {
      where.push('r.hidden_at IS NOT NULL');
    } else if (query.visibility === 'visible') {
      where.push('r.hidden_at IS NULL');
    }

    if (query.maxRating) {
      params.push(query.maxRating);
      where.push(`r.rating <= $${params.length}`);
    }

    const from = `FROM reviews r
      INNER JOIN users reviewer ON reviewer.id = r.reviewer_id
      INNER JOIN users reviewee ON reviewee.id = r.reviewee_id
      WHERE ${where.join(' AND ')}`;

    return this.paginate(
      `SELECT r.id, r.booking_id, r.rating, r.comment, r.created_at, r.hidden_at, r.hidden_reason,
              r.reviewer_id, reviewer.first_name AS reviewer_first_name, reviewer.last_name AS reviewer_last_name,
              r.reviewee_id, reviewee.first_name AS reviewee_first_name, reviewee.last_name AS reviewee_last_name
       ${from} ORDER BY r.created_at DESC`,
      `SELECT COUNT(*) AS total ${from}`,
      params,
      query,
      (row) => this.toReview(row)
    );
  }

  async setReviewVisibility(id: string, dto: SetReviewVisibilityDto) {
    const rows = await this.dataSource.query(
      dto.hidden
        ? `UPDATE reviews SET hidden_at = COALESCE(hidden_at, NOW()), hidden_reason = $2 WHERE id = $1 RETURNING id`
        : `UPDATE reviews SET hidden_at = NULL, hidden_reason = NULL WHERE id = $1 RETURNING id`,
      dto.hidden ? [id, dto.reason?.trim() || null] : [id]
    );

    if (!this.firstReturned(rows)) {
      throw new NotFoundException(`Review ${id} not found`);
    }

    return this.findReview(id);
  }

  // ---------------------------------------------------------------------------
  // Reservas
  // ---------------------------------------------------------------------------

  async listBookings(query: AdminBookingsQueryDto) {
    const where: string[] = ['TRUE'];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      where.push(`b.status = $${params.length}`);
    }

    const from = `${this.bookingFrom()} WHERE ${where.join(' AND ')}`;

    return this.paginate(
      `SELECT ${this.bookingColumns()} ${from} ORDER BY b.created_at DESC`,
      `SELECT COUNT(*) AS total ${from}`,
      params,
      query,
      (row) => this.toBooking(row)
    );
  }

  async getBooking(id: string) {
    const rows = await this.dataSource.query(
      `SELECT ${this.bookingColumns()} ${this.bookingFrom()} WHERE b.id = $1 LIMIT 1`,
      [id]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Booking ${id} not found`);
    }

    const [history, checklists, images, reviews, incidents] = await Promise.all([
      this.dataSource.query(
        `SELECT from_status, to_status, changed_at FROM booking_status_history
         WHERE booking_id = $1 ORDER BY changed_at ASC, id ASC`,
        [id]
      ),
      this.dataSource.query(
        `SELECT c.id, c.type, c.submitted_by, c.mileage, c.fuel_level, c.notes, c.created_at,
                u.first_name AS submitted_by_first_name, u.last_name AS submitted_by_last_name
         FROM booking_checklists c INNER JOIN users u ON u.id = c.submitted_by
         WHERE c.booking_id = $1 ORDER BY c.created_at ASC`,
        [id]
      ),
      this.dataSource.query(
        `SELECT ci.id, ci.checklist_id, ci.image_url, ci.created_at
         FROM checklist_images ci INNER JOIN booking_checklists c ON c.id = ci.checklist_id
         WHERE c.booking_id = $1 ORDER BY ci.created_at ASC`,
        [id]
      ),
      this.dataSource.query(`SELECT id FROM reviews WHERE booking_id = $1`, [id]),
      this.dataSource.query(`SELECT id, title, status, created_at FROM incidents WHERE booking_id = $1 ORDER BY created_at DESC`, [id])
    ]);

    const signedImages = await Promise.all(
      (images as Row[]).map(async (image) => ({
        id: String(image.id),
        checklistId: String(image.checklist_id),
        createdAt: image.created_at,
        file: await resolveFileUrl(image.image_url as string)
      }))
    );

    return {
      ...this.toBooking(rows[0] as Row),
      ownerContactMethod: (rows[0] as Row).owner_contact_method ?? null,
      history: (history as Row[]).map((row) => ({
        fromStatus: row.from_status ?? null,
        toStatus: row.to_status,
        changedAt: row.changed_at
      })),
      checklists: (checklists as Row[]).map((row) => ({
        id: String(row.id),
        type: row.type,
        mileage: Number(row.mileage),
        fuelLevel: Number(row.fuel_level),
        notes: row.notes ?? null,
        createdAt: row.created_at,
        submittedBy: {
          id: row.submitted_by,
          firstName: row.submitted_by_first_name,
          lastName: row.submitted_by_last_name
        },
        images: signedImages.filter((image) => image.checklistId === String(row.id))
      })),
      reviewIds: (reviews as Row[]).map((row) => String(row.id)),
      incidents: (incidents as Row[]).map((row) => ({
        id: String(row.id),
        title: row.title,
        status: row.status,
        createdAt: row.created_at
      }))
    };
  }

  // ---------------------------------------------------------------------------
  // Incidencias
  // ---------------------------------------------------------------------------

  async listIncidents(query: AdminIncidentsQueryDto) {
    const params: unknown[] = [];
    let where = 'TRUE';

    if (query.status) {
      params.push(query.status);
      where = `i.status = $${params.length}`;
    }

    const from = `FROM incidents i WHERE ${where}`;

    return this.paginate(
      `SELECT i.*, (SELECT COUNT(*) FROM incident_notes n WHERE n.incident_id = i.id) AS notes_count
       ${from} ORDER BY i.created_at DESC`,
      `SELECT COUNT(*) AS total ${from}`,
      params,
      query,
      (row) => this.toIncident(row)
    );
  }

  async createIncident(adminId: string, dto: CreateIncidentDto) {
    await this.ensureExists('bookings', dto.bookingId, 'Booking');
    await this.ensureExists('users', dto.userId, 'User');
    await this.ensureExists('vehicles', dto.vehicleId, 'Vehicle');

    const rows = await this.dataSource.query(
      `INSERT INTO incidents (title, description, booking_id, user_id, vehicle_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [dto.title.trim(), dto.description.trim(), dto.bookingId ?? null, dto.userId ?? null, dto.vehicleId ?? null, adminId]
    );

    return this.getIncident(String((rows[0] as Row).id));
  }

  async getIncident(id: string) {
    const rows = await this.dataSource.query(
      `SELECT i.*, 0 AS notes_count FROM incidents i WHERE i.id = $1 LIMIT 1`,
      [id]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    const notes = await this.dataSource.query(
      `SELECT n.id, n.body, n.created_at, n.author_id, u.first_name AS author_first_name, u.last_name AS author_last_name
       FROM incident_notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.incident_id = $1 ORDER BY n.created_at ASC`,
      [id]
    );

    return {
      ...this.toIncident({ ...(rows[0] as Row), notes_count: notes.length }),
      notes: (notes as Row[]).map((row) => ({
        id: String(row.id),
        body: row.body,
        createdAt: row.created_at,
        author: row.author_id
          ? { id: row.author_id, firstName: row.author_first_name, lastName: row.author_last_name }
          : null
      }))
    };
  }

  async setIncidentStatus(id: string, status: IncidentStatus) {
    const rows = await this.dataSource.query(
      `UPDATE incidents SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id, status]
    );

    if (!this.firstReturned(rows)) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    return this.getIncident(id);
  }

  async addIncidentNote(adminId: string, id: string, body: string) {
    const rows = await this.dataSource.query(`UPDATE incidents SET updated_at = NOW() WHERE id = $1 RETURNING id`, [id]);

    if (!this.firstReturned(rows)) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    await this.dataSource.query(`INSERT INTO incident_notes (incident_id, author_id, body) VALUES ($1, $2, $3)`, [
      id,
      adminId,
      body.trim()
    ]);

    return this.getIncident(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async paginate<T>(
    sql: string,
    countSql: string,
    params: unknown[],
    query: PaginationQueryDto,
    map: (row: Row) => T
  ): Promise<Paginated<T>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const limitIndex = params.length + 1;

    const [rows, count] = await Promise.all([
      this.dataSource.query(`${sql} LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`, [
        ...params,
        pageSize,
        (page - 1) * pageSize
      ]),
      this.dataSource.query(countSql, params)
    ]);

    return {
      items: (rows as Row[]).map(map),
      total: Number((count[0] as Row | undefined)?.total ?? 0),
      page,
      pageSize
    };
  }

  private async updateActiveUser(id: string, sql: string, params: unknown[]): Promise<void> {
    const rows = await this.dataSource.query(sql, params);

    if (!this.firstReturned(rows)) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }

  /** `query` de TypeORM devuelve `[rows, count]` en UPDATE ... RETURNING y `rows` en INSERT/SELECT. */
  private firstReturned(result: unknown): Row | undefined {
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return (result[0] as Row[])[0];
    }

    return Array.isArray(result) ? (result[0] as Row | undefined) : undefined;
  }

  private async ensureExists(table: 'bookings' | 'users' | 'vehicles', id: string | undefined, label: string) {
    if (!id) {
      return;
    }

    const rows = await this.dataSource.query(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [id]);

    if (!rows[0]) {
      throw new NotFoundException(`${label} ${id} not found`);
    }
  }

  private async syncSupabaseBan(userId: string, blocked: boolean): Promise<void> {
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      // Sin service role el bloqueo se aplica igualmente en la API (guard JWT).
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: blocked ? SUPABASE_BAN_DURATION : 'none'
    });

    if (error) {
      this.logger.warn(`No se pudo sincronizar el bloqueo en Supabase Auth para ${userId}`);
    }
  }

  private async findReview(id: string) {
    const rows = await this.dataSource.query(
      `SELECT r.id, r.booking_id, r.rating, r.comment, r.created_at, r.hidden_at, r.hidden_reason,
              r.reviewer_id, reviewer.first_name AS reviewer_first_name, reviewer.last_name AS reviewer_last_name,
              r.reviewee_id, reviewee.first_name AS reviewee_first_name, reviewee.last_name AS reviewee_last_name
       FROM reviews r
       INNER JOIN users reviewer ON reviewer.id = r.reviewer_id
       INNER JOIN users reviewee ON reviewee.id = r.reviewee_id
       WHERE r.id = $1`,
      [id]
    );

    return this.toReview(rows[0] as Row);
  }

  private bookingColumns(): string {
    return `b.id, b.status, b.start_datetime, b.end_datetime, b.price_per_day_at_booking, b.platform_fee,
            b.total_price, b.payment_intent_id, b.payout_status, b.owner_contact_method, b.created_at, b.updated_at,
            v.id AS vehicle_id, v.brand AS vehicle_brand, v.model AS vehicle_model, v.license_plate AS vehicle_license_plate,
            d.id AS driver_id, d.first_name AS driver_first_name, d.last_name AS driver_last_name,
            o.id AS owner_id, o.first_name AS owner_first_name, o.last_name AS owner_last_name`;
  }

  private bookingFrom(): string {
    return `FROM bookings b
      INNER JOIN vehicles v ON v.id = b.vehicle_id
      INNER JOIN users d ON d.id = b.driver_id
      INNER JOIN users o ON o.id = v.owner_id`;
  }

  private toUser(row: Row) {
    return {
      id: String(row.id),
      email: (row.email as string | null) ?? null,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      phoneNumber: (row.phone_number as string | null) ?? null,
      hasIdDocument: Boolean(row.id_document_url),
      hasDriverLicense: Boolean(row.driver_license_url),
      isVerified: Boolean(row.is_verified),
      isAdmin: Boolean(row.is_admin),
      blockedAt: (row.blocked_at as Date | null) ?? null,
      blockedReason: (row.blocked_reason as string | null) ?? null,
      hasStripeAccount: Boolean(row.stripe_account_id),
      createdAt: row.created_at as Date,
      deletedAt: (row.deleted_at as Date | null) ?? null
    };
  }

  private toVehicle(row: Row) {
    return {
      id: String(row.id),
      brand: row.brand as string,
      model: row.model as string,
      year: Number(row.year),
      licensePlate: row.license_plate as string,
      pricePerDay: Number(row.price_per_day),
      locationAddress: row.location_address as string,
      status: row.status as 'active' | 'inactive',
      primaryImageUrl: this.publicUrlOrNull(row.primary_image_url),
      bookings: Number(row.bookings ?? 0),
      createdAt: row.created_at as Date,
      owner: { id: row.owner_id as string, firstName: row.owner_first_name as string, lastName: row.owner_last_name as string }
    };
  }

  private toReview(row: Row) {
    return {
      id: String(row.id),
      bookingId: row.booking_id as string,
      rating: Number(row.rating),
      comment: (row.comment as string | null) ?? null,
      createdAt: row.created_at as Date,
      hiddenAt: (row.hidden_at as Date | null) ?? null,
      hiddenReason: (row.hidden_reason as string | null) ?? null,
      reviewer: { id: row.reviewer_id, firstName: row.reviewer_first_name, lastName: row.reviewer_last_name },
      reviewee: { id: row.reviewee_id, firstName: row.reviewee_first_name, lastName: row.reviewee_last_name }
    };
  }

  private toBooking(row: Row) {
    return {
      id: String(row.id),
      status: row.status as string,
      startDatetime: row.start_datetime as Date,
      endDatetime: row.end_datetime as Date,
      pricePerDayAtBooking: Number(row.price_per_day_at_booking),
      platformFee: Number(row.platform_fee),
      totalPrice: Number(row.total_price),
      paymentIntentId: (row.payment_intent_id as string | null) ?? null,
      payoutStatus: row.payout_status as string,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
      vehicle: {
        id: row.vehicle_id,
        brand: row.vehicle_brand,
        model: row.vehicle_model,
        licensePlate: row.vehicle_license_plate
      },
      driver: { id: row.driver_id, firstName: row.driver_first_name, lastName: row.driver_last_name },
      owner: { id: row.owner_id, firstName: row.owner_first_name, lastName: row.owner_last_name }
    };
  }

  private toIncident(row: Row) {
    return {
      id: String(row.id),
      title: row.title as string,
      description: row.description as string,
      status: row.status as IncidentStatus,
      bookingId: (row.booking_id as string | null) ?? null,
      userId: (row.user_id as string | null) ?? null,
      vehicleId: (row.vehicle_id as string | null) ?? null,
      createdBy: (row.created_by as string | null) ?? null,
      notesCount: Number(row.notes_count ?? 0),
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date
    };
  }

  // Las fotos de vehículos están en un bucket público: se construye la URL sin firmar.
  private publicUrlOrNull(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    const reference = parseStorageReference(value);
    const supabaseUrl = process.env.SUPABASE_URL;

    return reference && supabaseUrl
      ? `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${reference.bucket}/${reference.path}`
      : null;
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private applicationFeePercent(): number {
    const raw = Number(process.env.STRIPE_APPLICATION_FEE_PERCENT ?? '10');
    return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 10;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
