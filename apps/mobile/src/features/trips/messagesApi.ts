import type {
  BookingMessageResponse,
  BookingMessagesPageResponse,
  BookingMessagesUnreadResponse,
  MarkBookingMessagesReadResponse
} from '@lynkdrive/shared';
import { httpClient } from '../../api/http';

export type BookingMessage = BookingMessageResponse;
export type BookingMessagesPage = BookingMessagesPageResponse;

export async function fetchBookingMessages(
  bookingId: string,
  cursor: { after?: string; before?: string } = {}
): Promise<BookingMessagesPage> {
  const { data } = await httpClient.get<BookingMessagesPage>('/booking-messages', { params: { bookingId, ...cursor } });
  return data;
}

export async function sendBookingMessage(bookingId: string, body: string): Promise<BookingMessage> {
  const { data } = await httpClient.post<BookingMessage>('/booking-messages', { bookingId, body });
  return data;
}

export async function markBookingMessagesRead(bookingId: string): Promise<number> {
  const { data } = await httpClient.post<MarkBookingMessagesReadResponse>('/booking-messages/read', { bookingId });
  return data.updated;
}

/** No leídos por reserva (solo aparecen las reservas con alguno). */
export async function fetchUnreadMessages(): Promise<Record<string, number>> {
  const { data } = await httpClient.get<BookingMessagesUnreadResponse>('/booking-messages/unread');
  return Object.fromEntries(data.bookings.map((item) => [item.bookingId, item.unread]));
}
