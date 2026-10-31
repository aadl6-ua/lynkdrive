import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthUser } from 'src/auth/auth-user.type';
import { getSupabaseAdminClient, parseStorageReference, StorageReference } from 'src/common/supabase-storage';

const ACTIVE_BOOKING_STATUSES = ['pending', 'accepted', 'paid_confirmed', 'in_progress'];

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  id_document_url: string | null;
  driver_license_url: string | null;
  is_verified: boolean;
  created_at: Date;
  deleted_at: Date | null;
};

// Derechos RGPD del usuario autenticado: portabilidad (export) y supresion (delete).
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly dataSource: DataSource) {}

  async exportData(user: AuthUser) {
    const profile = await this.findUserRow(user.sub);

    if (!profile || profile.deleted_at) {
      throw new NotFoundException('User not found');
    }

    const [vehicles, vehicleImages, availabilityWindows, bookingsAsDriver, bookingsAsOwner, reviewsWritten, reviewsReceived, checklists] =
      await Promise.all([
        this.dataSource.query(
          `SELECT id, brand, model, year, license_plate, description, price_per_day,
                  ST_Y(location) AS location_lat, ST_X(location) AS location_lng, location_address,
                  fuel_type, transmission, seats, status, created_at, deleted_at
           FROM vehicles WHERE owner_id = $1 ORDER BY created_at`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT vi.id, vi.vehicle_id, vi.image_url, vi.is_primary, vi.created_at
           FROM vehicle_images vi INNER JOIN vehicles v ON v.id = vi.vehicle_id
           WHERE v.owner_id = $1 ORDER BY vi.created_at`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT w.id, w.vehicle_id, w.start_datetime, w.end_datetime, w.created_at
           FROM vehicle_availability_windows w INNER JOIN vehicles v ON v.id = w.vehicle_id
           WHERE v.owner_id = $1 ORDER BY w.start_datetime`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT id, vehicle_id, start_datetime, end_datetime, price_per_day_at_booking, platform_fee,
                  total_price, status, payment_intent_id, payout_status, owner_contact_method, created_at, updated_at
           FROM bookings WHERE driver_id = $1 ORDER BY created_at`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT b.id, b.vehicle_id, b.start_datetime, b.end_datetime, b.price_per_day_at_booking, b.platform_fee,
                  b.total_price, b.status, b.payout_status, b.owner_contact_method, b.created_at, b.updated_at
           FROM bookings b INNER JOIN vehicles v ON v.id = b.vehicle_id
           WHERE v.owner_id = $1 ORDER BY b.created_at`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT id, booking_id, reviewee_id, rating, comment, created_at
           FROM reviews WHERE reviewer_id = $1 ORDER BY created_at`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT id, booking_id, reviewer_id, rating, comment, created_at
           FROM reviews WHERE reviewee_id = $1 ORDER BY created_at`,
          [user.sub]
        ),
        this.dataSource.query(
          `SELECT c.id, c.booking_id, c.type, c.mileage, c.fuel_level, c.notes, c.created_at,
                  COALESCE(json_agg(ci.image_url) FILTER (WHERE ci.id IS NOT NULL), '[]') AS images
           FROM booking_checklists c LEFT JOIN checklist_images ci ON ci.checklist_id = c.id
           WHERE c.submitted_by = $1
           GROUP BY c.id ORDER BY c.created_at`,
          [user.sub]
        )
      ]);

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.sub,
        email: user.email ?? null
      },
      profile: {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        phoneNumber: profile.phone_number,
        avatarUrl: profile.avatar_url,
        idDocumentUrl: profile.id_document_url,
        driverLicenseUrl: profile.driver_license_url,
        isVerified: profile.is_verified,
        createdAt: profile.created_at
      },
      vehicles,
      vehicleImages,
      availabilityWindows,
      bookingsAsDriver,
      bookingsAsOwner,
      reviewsWritten,
      reviewsReceived,
      checklistsSubmitted: checklists
    };
  }

  // Supresion: se anonimiza el perfil (soft-delete, sin borrado fisico por integridad del historial),
  // se retiran sus vehiculos, se borran sus ficheros personales y se elimina la cuenta de Supabase Auth.
  async deleteAccount(user: AuthUser): Promise<void> {
    // Sin cliente admin no se puede borrar la cuenta de auth: se falla antes de anonimizar nada.
    if (!getSupabaseAdminClient()) {
      this.logger.error('Falta configuracion de Supabase admin: no se puede eliminar la cuenta de auth');
      throw new InternalServerErrorException('No se pudo completar la eliminacion de la cuenta');
    }

    const profile = await this.findUserRow(user.sub);

    if (profile && !profile.deleted_at) {
      const vehicleImageRows: Array<{ image_url: string }> = await this.dataSource.query(
        `SELECT vi.image_url FROM vehicle_images vi INNER JOIN vehicles v ON v.id = vi.vehicle_id
         WHERE v.owner_id = $1`,
        [user.sub]
      );

      const checklistImageRows: Array<{ image_url: string }> = await this.dataSource.query(
        `SELECT ci.image_url FROM checklist_images ci
         INNER JOIN booking_checklists c ON c.id = ci.checklist_id
         WHERE c.submitted_by = $1`,
        [user.sub]
      );

      const filesToRemove = [
        profile.avatar_url,
        profile.id_document_url,
        profile.driver_license_url,
        ...vehicleImageRows.map((row) => row.image_url),
        ...checklistImageRows.map((row) => row.image_url)
      ]
        .map((value) => parseStorageReference(value))
        .filter((reference): reference is StorageReference => reference !== null);

      await this.dataSource.transaction(async (manager) => {
        // Se bloquean las reservas del usuario para que no cambien de estado durante la baja.
        const activeBookings = await manager.query(
          `SELECT b.id FROM bookings b INNER JOIN vehicles v ON v.id = b.vehicle_id
           WHERE (b.driver_id = $1 OR v.owner_id = $1) AND b.status = ANY($2::booking_status_enum[])
           LIMIT 1 FOR UPDATE OF b`,
          [user.sub, ACTIVE_BOOKING_STATUSES]
        );

        if (activeBookings[0]?.id) {
          throw new ConflictException(
            'No puedes eliminar la cuenta con reservas activas. Cancela o finaliza tus reservas primero.'
          );
        }

        await manager.query(
          `UPDATE vehicles SET status = 'inactive', deleted_at = COALESCE(deleted_at, NOW())
           WHERE owner_id = $1`,
          [user.sub]
        );
        await manager.query(
          `DELETE FROM vehicle_images WHERE vehicle_id IN (SELECT id FROM vehicles WHERE owner_id = $1)`,
          [user.sub]
        );
        await manager.query(
          `DELETE FROM vehicle_availability_windows WHERE vehicle_id IN (SELECT id FROM vehicles WHERE owner_id = $1)`,
          [user.sub]
        );
        await manager.query(`UPDATE reviews SET comment = NULL WHERE reviewer_id = $1`, [user.sub]);
        // Las reservas completadas/rechazadas/canceladas se conservan (historial contable) sin datos personales.
        await manager.query(
          `UPDATE bookings SET owner_contact_method = NULL
           WHERE driver_id = $1 OR vehicle_id IN (SELECT id FROM vehicles WHERE owner_id = $1)`,
          [user.sub]
        );
        await manager.query(
          `DELETE FROM checklist_images WHERE checklist_id IN (SELECT id FROM booking_checklists WHERE submitted_by = $1)`,
          [user.sub]
        );
        await manager.query(`UPDATE booking_checklists SET notes = NULL WHERE submitted_by = $1`, [user.sub]);
        await manager.query(
          `UPDATE users SET
             first_name = 'Usuario',
             last_name = 'eliminado',
             phone_number = NULL,
             avatar_url = NULL,
             id_document_url = NULL,
             driver_license_url = NULL,
             is_verified = FALSE,
             stripe_customer_id = NULL,
             stripe_account_id = NULL,
             deleted_at = NOW()
           WHERE id = $1`,
          [user.sub]
        );
      });

      await this.removeStorageFiles(filesToRemove);
    }

    await this.deleteAuthUser(user.sub);
  }

  private async findUserRow(userId: string): Promise<UserRow | null> {
    const rows = await this.dataSource.query(
      `SELECT id, first_name, last_name, phone_number, avatar_url, id_document_url, driver_license_url,
              is_verified, created_at, deleted_at
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    return (rows[0] as UserRow | undefined) ?? null;
  }

  private async removeStorageFiles(references: StorageReference[]): Promise<void> {
    const supabase = getSupabaseAdminClient();

    if (!supabase || references.length === 0) {
      return;
    }

    const pathsByBucket = new Map<string, string[]>();

    for (const reference of references) {
      pathsByBucket.set(reference.bucket, [...(pathsByBucket.get(reference.bucket) ?? []), reference.path]);
    }

    for (const [bucket, paths] of pathsByBucket) {
      const { error } = await supabase.storage.from(bucket).remove(paths);

      if (error) {
        // No se bloquea la baja: se registra para limpieza manual posterior.
        this.logger.warn(`No se pudieron borrar ${paths.length} ficheros del bucket ${bucket}`);
      }
    }
  }

  private async deleteAuthUser(userId: string): Promise<void> {
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      this.logger.error('Falta configuracion de Supabase admin: no se puede eliminar la cuenta de auth');
      throw new InternalServerErrorException('No se pudo completar la eliminacion de la cuenta');
    }

    // Soft delete en Supabase Auth: invalida el acceso y anonimiza la identidad sin romper referencias.
    const { error } = await supabase.auth.admin.deleteUser(userId, true);

    if (error && error.status !== 404) {
      this.logger.error(`Error eliminando usuario de Supabase Auth (status ${error.status ?? 'desconocido'})`);
      throw new InternalServerErrorException('No se pudo completar la eliminacion de la cuenta');
    }
  }
}
