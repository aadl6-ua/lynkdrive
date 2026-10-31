import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PushPlatform } from './dto/register-push-token.dto';

/** Mismos nombres que los eventos de email de reservas, más el inicio del viaje. */
export type BookingPushEvent =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo admite hasta 100 mensajes por petición.
const EXPO_PUSH_BATCH_SIZE = 100;
const EXPO_PUSH_TIMEOUT_MS = 5000;

type BookingPushRow = {
  id: string;
  status: string;
  brand: string;
  model: string;
  owner_id: string;
  driver_id: string;
  owner_first_name: string;
  driver_first_name: string;
};

type Recipient = 'owner' | 'driver';

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data:
    | { type: 'booking'; bookingId: string; event: BookingPushEvent }
    | { type: 'booking_message'; bookingId: string };
};

// Vista previa del mensaje de chat en la notificación.
const MESSAGE_PREVIEW_LENGTH = 120;

type ExpoPushTicket = { status: 'ok' | 'error'; details?: { error?: string } };

/**
 * Notificaciones push (Expo Push API por HTTP) de cambios de estado de una reserva.
 * Nunca bloquea ni hace fallar la operación: los errores solo se registran, sin datos personales.
 */
@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private readonly dataSource: DataSource) {}

  isEnabled(): boolean {
    return process.env.PUSH_NOTIFICATIONS_ENABLED !== 'false';
  }

  async registerToken(userId: string, token: string, platform: PushPlatform): Promise<void> {
    // Un dispositivo solo pertenece al último usuario que inició sesión en él.
    await this.dataSource.query(
      `
        INSERT INTO push_tokens (user_id, token, platform)
        VALUES ($1, $2, $3)
        ON CONFLICT (token) DO UPDATE
          SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = CURRENT_TIMESTAMP
      `,
      [userId, token, platform]
    );
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, [userId, token]);
  }

  /** Lanza el envío en segundo plano. `actorId` es quien provocó el cambio (no se le notifica). */
  notify(event: BookingPushEvent, bookingId: string, actorId?: string): void {
    if (!this.isEnabled()) {
      return;
    }

    void this.send(event, bookingId, actorId).catch(() => {
      this.logger.warn(`No se pudo enviar la notificación push del evento ${event} de una reserva`);
    });
  }

  async send(event: BookingPushEvent, bookingId: string, actorId?: string): Promise<number> {
    const booking = await this.loadBooking(bookingId);

    if (!booking) {
      return 0;
    }

    const recipients = this.recipientsFor(event, booking, actorId);
    const userIds = recipients.map((recipient) => (recipient === 'owner' ? booking.owner_id : booking.driver_id));
    const tokenRows: Array<{ user_id: string; token: string }> = await this.dataSource.query(
      `SELECT user_id, token FROM push_tokens WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );

    const messages = tokenRows.map((row) => {
      const recipient: Recipient = row.user_id === booking.owner_id ? 'owner' : 'driver';
      return { to: row.token, sound: 'default' as const, ...this.compose(event, recipient, booking) };
    });

    return this.deliver(messages);
  }

  /** Aviso de mensaje de chat nuevo al otro participante, en segundo plano. */
  notifyMessage(bookingId: string, senderId: string, recipientId: string, text: string): void {
    if (!this.isEnabled()) {
      return;
    }

    void this.sendMessage(bookingId, senderId, recipientId, text).catch(() => {
      this.logger.warn('No se pudo enviar la notificación push de un mensaje de reserva');
    });
  }

  async sendMessage(bookingId: string, senderId: string, recipientId: string, text: string): Promise<number> {
    const booking = await this.loadBooking(bookingId);

    if (!booking) {
      return 0;
    }

    const senderName = senderId === booking.owner_id ? booking.owner_first_name : booking.driver_first_name;
    const preview = text.length > MESSAGE_PREVIEW_LENGTH ? `${text.slice(0, MESSAGE_PREVIEW_LENGTH - 3)}...` : text;
    const tokenRows: Array<{ token: string }> = await this.dataSource.query(
      `SELECT token FROM push_tokens WHERE user_id = $1`,
      [recipientId]
    );

    return this.deliver(
      tokenRows.map((row) => ({
        to: row.token,
        sound: 'default' as const,
        title: `Mensaje de ${senderName} (${booking.brand} ${booking.model})`,
        body: preview,
        data: { type: 'booking_message' as const, bookingId: booking.id }
      }))
    );
  }

  recipientsFor(event: BookingPushEvent, booking: Pick<BookingPushRow, 'owner_id' | 'driver_id'>, actorId?: string): Recipient[] {
    switch (event) {
      case 'requested':
        return ['owner'];
      case 'accepted':
      case 'rejected':
        return ['driver'];
      case 'paid_confirmed':
        return ['owner'];
      case 'completed':
        // Ambos pueden dejar reseña a partir de ahora.
        return ['owner', 'driver'];
      case 'in_progress':
      case 'cancelled':
        if (!actorId) {
          return ['owner', 'driver'];
        }
        return [actorId === booking.owner_id ? 'driver' : 'owner'];
    }
  }

  compose(event: BookingPushEvent, recipient: Recipient, booking: BookingPushRow): Omit<ExpoPushMessage, 'to' | 'sound'> {
    const vehicle = `${booking.brand} ${booking.model}`;
    const other = recipient === 'owner' ? booking.driver_first_name : booking.owner_first_name;

    const content: Record<BookingPushEvent, { title: string; body: string }> = {
      requested: { title: 'Nueva solicitud de reserva', body: `${other} quiere reservar tu ${vehicle}.` },
      accepted: { title: 'Reserva aceptada', body: `${other} ha aceptado tu solicitud del ${vehicle}. Paga para confirmarla.` },
      rejected: { title: 'Solicitud no aceptada', body: `Tu solicitud del ${vehicle} no ha sido aceptada.` },
      paid_confirmed: { title: 'Reserva pagada', body: `${other} ha pagado la reserva de tu ${vehicle}.` },
      in_progress: { title: 'Viaje iniciado', body: `El viaje con el ${vehicle} ha comenzado.` },
      completed: { title: 'Viaje completado', body: `Ya puedes valorar a ${other} por el viaje con el ${vehicle}.` },
      cancelled: { title: 'Reserva cancelada', body: `${other} ha cancelado la reserva del ${vehicle}.` }
    };

    return { ...content[event], data: { type: 'booking', bookingId: booking.id, event } };
  }

  /** Envía a Expo por lotes y borra los tokens que Expo marca como DeviceNotRegistered. */
  async deliver(messages: ExpoPushMessage[]): Promise<number> {
    let sent = 0;

    for (let index = 0; index < messages.length; index += EXPO_PUSH_BATCH_SIZE) {
      const batch = messages.slice(index, index + EXPO_PUSH_BATCH_SIZE);
      const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };

      if (process.env.EXPO_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
      }

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS)
      });

      if (!response.ok) {
        this.logger.warn(`Expo Push API respondió ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoPushTicket[] };
      const tickets = payload.data ?? [];
      const invalidTokens = batch
        .filter((_, position) => tickets[position]?.details?.error === 'DeviceNotRegistered')
        .map((message) => message.to);

      sent += tickets.filter((ticket) => ticket.status === 'ok').length;

      if (invalidTokens.length > 0) {
        await this.dataSource.query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [invalidTokens]);
      }
    }

    return sent;
  }

  private async loadBooking(bookingId: string): Promise<BookingPushRow | null> {
    const rows = await this.dataSource.query(
      `
        SELECT b.id, b.status, v.brand, v.model, v.owner_id, b.driver_id,
               ou.first_name AS owner_first_name, du.first_name AS driver_first_name
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        INNER JOIN users ou ON ou.id = v.owner_id AND ou.deleted_at IS NULL
        INNER JOIN users du ON du.id = b.driver_id AND du.deleted_at IS NULL
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId]
    );

    return (rows[0] as BookingPushRow | undefined) ?? null;
  }
}
