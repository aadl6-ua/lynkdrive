import type { IsoDateString } from './common';

/** Mensaje del chat interno de una reserva (`/booking-messages`). */
export interface BookingMessageResponse<TDate = IsoDateString> {
  id: string;
  bookingId: string;
  senderId: string;
  /** Texto plano, entre 1 y 2000 caracteres. */
  body: string;
  createdAt: TDate;
  /** Cuándo lo leyó el destinatario; `null` si no lo ha leído. */
  readAt: TDate | null;
}

/** Respuesta de `GET /booking-messages?bookingId=...`. Mensajes en orden cronológico ascendente. */
export interface BookingMessagesPageResponse<TDate = IsoDateString> {
  messages: Array<BookingMessageResponse<TDate>>;
  /** Hay más mensajes en la dirección pedida (anteriores con `before` o sin cursor; posteriores con `after`). */
  hasMore: boolean;
  /** Si el usuario autenticado puede enviar mensajes ahora en esta reserva. */
  canSend: boolean;
  /** Motivo legible cuando `canSend` es `false`. */
  sendBlockedReason: string | null;
}

/** Cuerpo de `POST /booking-messages` (el autor se toma del JWT). */
export interface CreateBookingMessageRequest {
  bookingId: string;
  body: string;
}

/** Cuerpo de `POST /booking-messages/read`. */
export interface MarkBookingMessagesReadRequest {
  bookingId: string;
}

/** Respuesta de `POST /booking-messages/read`. */
export interface MarkBookingMessagesReadResponse {
  updated: number;
}

/** Respuesta de `GET /booking-messages/unread`: solo reservas con mensajes sin leer. */
export interface BookingMessagesUnreadResponse {
  total: number;
  bookings: Array<{ bookingId: string; unread: number }>;
}
