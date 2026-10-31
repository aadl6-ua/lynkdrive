import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmailMessage, MailerService } from './mailer.service';

export type BookingEmailEvent = 'requested' | 'accepted' | 'rejected' | 'paid_confirmed' | 'completed' | 'cancelled';

type BookingEmailRow = {
  id: string;
  start_datetime: Date | string;
  end_datetime: Date | string;
  total_price: string | number;
  owner_contact_method: string | null;
  brand: string;
  model: string;
  owner_id: string;
  driver_id: string;
  owner_first_name: string;
  driver_first_name: string;
  owner_email: string | null;
  driver_email: string | null;
};

type Recipient = 'owner' | 'driver';

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Madrid'
});

const currencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Emails automáticos de cambios de estado de una reserva. Nunca bloquea ni hace fallar
 * la operación: si el email no está configurado o el envío falla, solo se registra un aviso.
 */
@Injectable()
export class BookingNotificationsService {
  private readonly logger = new Logger(BookingNotificationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService
  ) {}

  /** Lanza el envío en segundo plano. `actorId` es quien provocó el cambio (para cancelaciones). */
  notify(event: BookingEmailEvent, bookingId: string, actorId?: string): void {
    if (!this.mailer.isEnabled()) {
      return;
    }

    void this.send(event, bookingId, actorId).catch(() => {
      this.logger.warn(`No se pudo notificar el evento ${event} de una reserva`);
    });
  }

  async send(event: BookingEmailEvent, bookingId: string, actorId?: string): Promise<number> {
    const booking = await this.loadBooking(bookingId);

    if (!booking) {
      return 0;
    }

    let sent = 0;

    for (const recipient of this.recipientsFor(event, booking, actorId)) {
      const to = recipient === 'owner' ? booking.owner_email : booking.driver_email;

      if (to && (await this.mailer.send({ to, ...this.compose(event, recipient, booking) }))) {
        sent += 1;
      }
    }

    return sent;
  }

  private recipientsFor(event: BookingEmailEvent, booking: BookingEmailRow, actorId?: string): Recipient[] {
    switch (event) {
      case 'requested':
        return ['owner'];
      case 'accepted':
      case 'rejected':
        return ['driver'];
      case 'paid_confirmed':
      case 'completed':
        return ['owner', 'driver'];
      case 'cancelled':
        return [actorId === booking.owner_id ? 'driver' : 'owner'];
    }
  }

  compose(event: BookingEmailEvent, recipient: Recipient, booking: BookingEmailRow): Omit<EmailMessage, 'to'> {
    const vehicle = `${booking.brand} ${booking.model}`;
    const dates = `${dateFormatter.format(new Date(booking.start_datetime))} → ${dateFormatter.format(new Date(booking.end_datetime))}`;
    const total = currencyFormatter.format(Number(booking.total_price));
    const name = recipient === 'owner' ? booking.owner_first_name : booking.driver_first_name;
    const other = recipient === 'owner' ? booking.driver_first_name : booking.owner_first_name;

    const content: Record<BookingEmailEvent, { subject: string; lines: string[] }> = {
      requested: {
        subject: `Nueva solicitud para tu ${vehicle}`,
        lines: [`${other} quiere reservar tu ${vehicle}.`, 'Acéptala o recházala desde Mis Viajes. Las solicitudes no bloquean tu calendario hasta que las aceptas.']
      },
      accepted: {
        subject: `${other} ha aceptado tu reserva`,
        lines: [
          `Tu solicitud del ${vehicle} está aceptada. Paga desde Mis Viajes para confirmarla.`,
          ...(booking.owner_contact_method ? [`Contacto del propietario: ${booking.owner_contact_method}`] : [])
        ]
      },
      rejected: {
        subject: `Tu solicitud del ${vehicle} no ha sido aceptada`,
        lines: ['El propietario no puede atender estas fechas. Hay más coches disponibles cerca de ti en Explorar.']
      },
      paid_confirmed:
        recipient === 'owner'
          ? {
              subject: `Reserva confirmada: ${vehicle}`,
              lines: [`${other} ha pagado la reserva. Prepara la entrega de llaves; el conductor rellenará el checklist de entrega al recoger el coche.`]
            }
          : {
              subject: `Pago confirmado: ${vehicle}`,
              lines: ['Tu reserva está confirmada. Al recoger el coche, rellena el checklist de entrega con fotos desde Mis Viajes.']
            },
      completed: {
        subject: `Viaje completado: ${vehicle}`,
        lines: [`Gracias por usar LynkDrive. Valora a ${other} desde Mis Viajes: tus reseñas ayudan a toda la comunidad.`]
      },
      cancelled: {
        subject: `Reserva cancelada: ${vehicle}`,
        lines: [
          `${other} ha cancelado la reserva.`,
          ...(recipient === 'driver' ? ['Si ya habías pagado, recibirás el reembolso según la política de cancelación.'] : [])
        ]
      }
    };

    const { subject, lines } = content[event];
    const appUrl = process.env.APP_PUBLIC_URL;
    const details = [`Vehículo: ${vehicle}`, `Fechas: ${dates}`, `Total: ${total}`];
    const text = [`Hola, ${name}:`, '', ...lines, '', ...details, ...(appUrl ? ['', `Abrir LynkDrive: ${appUrl}`] : []), '', 'El equipo de LynkDrive'].join('\n');

    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F7F7F9;font-family:Arial,Helvetica,sans-serif;color:#121212">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E2E4E8;border-radius:12px">
<tr><td style="padding:20px 24px;background:#0D1B2A;border-radius:12px 12px 0 0;color:#F4D35E;font-size:20px;font-weight:bold">LynkDrive</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px">Hola, ${escapeHtml(name)}:</p>
${lines.map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px">${escapeHtml(line)}</p>`).join('')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;background:#F7F7F9;border-radius:10px">
${details.map((line) => `<tr><td style="padding:8px 12px;font-size:14px;color:#5C5C5C">${escapeHtml(line)}</td></tr>`).join('')}
</table>
${appUrl ? `<a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 20px;background:#0D1B2A;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:bold">Abrir LynkDrive</a>` : ''}
</td></tr></table>
<p style="font-size:12px;color:#5C5C5C">Recibes este email porque tienes una reserva en LynkDrive.</p>
</td></tr></table></body></html>`;

    return { subject, text, html };
  }

  private async loadBooking(bookingId: string): Promise<BookingEmailRow | null> {
    const rows = await this.dataSource.query(
      `
        SELECT b.id, b.start_datetime, b.end_datetime, b.total_price, b.owner_contact_method,
               v.brand, v.model, v.owner_id, b.driver_id,
               ou.first_name AS owner_first_name, du.first_name AS driver_first_name,
               (SELECT email FROM auth.users WHERE id = v.owner_id) AS owner_email,
               (SELECT email FROM auth.users WHERE id = b.driver_id) AS driver_email
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        INNER JOIN users ou ON ou.id = v.owner_id AND ou.deleted_at IS NULL
        INNER JOIN users du ON du.id = b.driver_id AND du.deleted_at IS NULL
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId]
    );

    return (rows[0] as BookingEmailRow | undefined) ?? null;
  }
}
