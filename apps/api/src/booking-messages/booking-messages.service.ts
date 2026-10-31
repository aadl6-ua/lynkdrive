import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  BookingMessagesPageResponse,
  BookingMessagesUnreadResponse,
  BookingStatus,
  MarkBookingMessagesReadResponse
} from '@lynkdrive/shared';
import { PushNotificationsService } from 'src/push-notifications/push-notifications.service';
import {
  BookingMessageResponseDto,
  CreateBookingMessageDto,
  ListBookingMessagesQueryDto,
  MESSAGE_MAX_LENGTH,
  MESSAGES_DEFAULT_LIMIT
} from './dto/booking-message.dto';

/** Estados en los que la conversación está abierta. */
export const MESSAGING_OPEN_STATUSES: BookingStatus[] = ['pending', 'accepted', 'paid_confirmed', 'in_progress'];
/** Días que sigue abierta la conversación tras completar el viaje (incidencias, objetos olvidados...). */
export const MESSAGING_DAYS_AFTER_COMPLETED = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BookingChatRow = {
  booking_id: string;
  owner_id: string;
  driver_id: string;
  status: BookingStatus;
  completed_at: Date | null;
  owner_deleted: boolean;
  driver_deleted: boolean;
};

type MessageRow = {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
};

const MESSAGE_COLUMNS = 'id, booking_id, sender_id, body, created_at, read_at';

@Injectable()
export class BookingMessagesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pushNotifications: PushNotificationsService
  ) {}

  async list(userId: string, query: ListBookingMessagesQueryDto): Promise<BookingMessagesPageResponse<Date>> {
    if (query.after && query.before) {
      throw new BadRequestException('Usa after o before, no ambos');
    }

    const booking = await this.ensureParticipant(query.bookingId, userId);
    const limit = query.limit ?? MESSAGES_DEFAULT_LIMIT;
    const cursorId = query.after ?? query.before;

    if (cursorId) {
      const cursor = await this.dataSource.query(`SELECT 1 FROM booking_messages WHERE id = $1 AND booking_id = $2`, [
        cursorId,
        query.bookingId
      ]);

      if (cursor.length === 0) {
        throw new BadRequestException('El cursor no pertenece a esta reserva');
      }
    }

    // Keyset sobre (created_at, id): estable aunque lleguen mensajes nuevos entre páginas.
    let rows: MessageRow[];

    if (query.after) {
      rows = await this.dataSource.query(
        `SELECT ${MESSAGE_COLUMNS} FROM booking_messages
         WHERE booking_id = $1
           AND (created_at, id) > (SELECT created_at, id FROM booking_messages WHERE id = $2)
         ORDER BY created_at ASC, id ASC
         LIMIT $3`,
        [query.bookingId, query.after, limit + 1]
      );
    } else {
      const params: unknown[] = [query.bookingId, limit + 1];
      const beforeFilter = query.before
        ? `AND (created_at, id) < (SELECT created_at, id FROM booking_messages WHERE id = $3)`
        : '';

      if (query.before) {
        params.push(query.before);
      }

      rows = await this.dataSource.query(
        `SELECT ${MESSAGE_COLUMNS} FROM booking_messages
         WHERE booking_id = $1 ${beforeFilter}
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        params
      );
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    if (!query.after) {
      page.reverse();
    }

    const sendBlockedReason = this.sendBlockedReason(booking, userId);

    return {
      messages: page.map((row) => this.toResponse(row)),
      hasMore,
      canSend: sendBlockedReason === null,
      sendBlockedReason
    };
  }

  async create(userId: string, dto: CreateBookingMessageDto): Promise<BookingMessageResponseDto> {
    const body = typeof dto.body === 'string' ? dto.body.trim() : '';

    if (body.length === 0 || body.length > MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(`El mensaje debe tener entre 1 y ${MESSAGE_MAX_LENGTH} caracteres`);
    }

    const booking = await this.ensureParticipant(dto.bookingId, userId);
    const blockedReason = this.sendBlockedReason(booking, userId);

    if (blockedReason) {
      throw new ForbiddenException(blockedReason);
    }

    const rows: MessageRow[] = await this.dataSource.query(
      `INSERT INTO booking_messages (booking_id, sender_id, body) VALUES ($1, $2, $3) RETURNING ${MESSAGE_COLUMNS}`,
      [dto.bookingId, userId, body]
    );
    const message = this.toResponse(rows[0]);
    const recipientId = booking.owner_id === userId ? booking.driver_id : booking.owner_id;

    // En segundo plano: nunca bloquea ni hace fallar el envío.
    this.pushNotifications.notifyMessage(dto.bookingId, userId, recipientId, body);

    return message;
  }

  /** Marca como leídos los mensajes que la otra parte envió al usuario en esa reserva. */
  async markRead(userId: string, bookingId: string): Promise<MarkBookingMessagesReadResponse> {
    await this.ensureParticipant(bookingId, userId);

    const result = await this.dataSource.query(
      `UPDATE booking_messages SET read_at = CURRENT_TIMESTAMP
       WHERE booking_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
      [bookingId, userId]
    );

    return { updated: this.affectedRows(result) };
  }

  async unread(userId: string): Promise<BookingMessagesUnreadResponse> {
    const rows: Array<{ booking_id: string; unread: number }> = await this.dataSource.query(
      `SELECT m.booking_id, COUNT(*)::int AS unread
       FROM booking_messages m
       INNER JOIN bookings b ON b.id = m.booking_id
       INNER JOIN vehicles v ON v.id = b.vehicle_id
       WHERE (b.driver_id = $1 OR v.owner_id = $1)
         AND m.sender_id <> $1
         AND m.read_at IS NULL
       GROUP BY m.booking_id
       ORDER BY m.booking_id`,
      [userId]
    );

    const bookings = rows.map((row) => ({ bookingId: row.booking_id, unread: Number(row.unread) }));

    return { total: bookings.reduce((sum, item) => sum + item.unread, 0), bookings };
  }

  /** `null` si el usuario puede escribir; si no, el motivo para mostrar en la app. */
  sendBlockedReason(booking: BookingChatRow, userId: string, now: Date = new Date()): string | null {
    const otherDeleted = booking.owner_id === userId ? booking.driver_deleted : booking.owner_deleted;

    if (otherDeleted) {
      return 'La otra parte ha eliminado su cuenta.';
    }

    if (MESSAGING_OPEN_STATUSES.includes(booking.status)) {
      return null;
    }

    if (booking.status === 'completed') {
      const completedAt = booking.completed_at ? new Date(booking.completed_at).getTime() : 0;

      if (now.getTime() - completedAt <= MESSAGING_DAYS_AFTER_COMPLETED * DAY_MS) {
        return null;
      }

      return `La conversación se cerró ${MESSAGING_DAYS_AFTER_COMPLETED} días después de completar el viaje.`;
    }

    return 'La conversación está cerrada porque la reserva no sigue adelante.';
  }

  private async ensureParticipant(bookingId: string, userId: string): Promise<BookingChatRow> {
    const rows = await this.dataSource.query(
      `SELECT b.id AS booking_id, v.owner_id, b.driver_id, b.status,
              (SELECT MAX(h.changed_at) FROM booking_status_history h
               WHERE h.booking_id = b.id AND h.to_status = 'completed') AS completed_at,
              (ou.deleted_at IS NOT NULL) AS owner_deleted,
              (du.deleted_at IS NOT NULL) AS driver_deleted
       FROM bookings b
       INNER JOIN vehicles v ON v.id = b.vehicle_id
       INNER JOIN users ou ON ou.id = v.owner_id
       INNER JOIN users du ON du.id = b.driver_id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId]
    );

    const booking = (rows[0] as BookingChatRow | undefined) ?? null;

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.owner_id !== userId && booking.driver_id !== userId) {
      throw new ForbiddenException('No tienes acceso a esta reserva');
    }

    return booking;
  }

  private affectedRows(result: unknown): number {
    // pg devuelve [rows, rowCount] para UPDATE vía DataSource.query.
    if (Array.isArray(result) && typeof result[1] === 'number') {
      return result[1];
    }

    return 0;
  }

  private toResponse(row: MessageRow): BookingMessageResponseDto {
    return {
      id: row.id,
      bookingId: row.booking_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at,
      readAt: row.read_at
    };
  }
}
