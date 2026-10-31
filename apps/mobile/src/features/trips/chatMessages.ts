import { formatDateMadrid, getMadridParts } from '../../shared/format';
import type { BookingMessage } from './messagesApi';

export const CHAT_MESSAGE_MAX_LENGTH = 2000;
/** Mensajes consecutivos del mismo autor separados menos de esto se agrupan visualmente. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/** Mensaje escrito en este dispositivo que aún no ha confirmado la API. */
export type OutgoingMessage = {
  localId: string;
  body: string;
  createdAt: string;
  status: 'sending' | 'failed';
};

export type ChatMessageStatus = 'sent' | 'read' | 'sending' | 'failed';

export type ChatItem =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      body: string;
      createdAt: string;
      mine: boolean;
      /** Primer mensaje de un bloque del mismo autor (muestra separación extra). */
      startsGroup: boolean;
      status: ChatMessageStatus;
      localId?: string;
    };

function compareMessages(a: BookingMessage, b: BookingMessage): number {
  const byDate = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

/** Une páginas o resultados de polling sin duplicados y en orden cronológico; lo más reciente gana. */
export function mergeMessages(current: BookingMessage[], incoming: BookingMessage[]): BookingMessage[] {
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return Array.from(byId.values()).sort(compareMessages);
}

function madridDayKey(value: string): string {
  const parts = getMadridParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : value.slice(0, 10);
}

/** "Hoy", "Ayer" o la fecha, siempre en Europe/Madrid. */
export function formatChatDayLabel(value: string, now: Date = new Date()): string {
  const key = madridDayKey(value);

  if (key === madridDayKey(now.toISOString())) {
    return 'Hoy';
  }

  if (key === madridDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())) {
    return 'Ayer';
  }

  return formatDateMadrid(value);
}

/** Lista para pintar: separadores de día y burbujas agrupadas por autor, con los pendientes al final. */
export function buildChatItems(
  messages: BookingMessage[],
  outgoing: OutgoingMessage[],
  myUserId: string | null,
  now: Date = new Date()
): ChatItem[] {
  const entries = [
    ...messages.map((message) => ({
      key: message.id,
      body: message.body,
      createdAt: message.createdAt,
      mine: message.senderId === myUserId,
      status: (message.readAt ? 'read' : 'sent') as ChatMessageStatus,
      localId: undefined as string | undefined
    })),
    ...outgoing.map((message) => ({
      key: message.localId,
      body: message.body,
      createdAt: message.createdAt,
      mine: true,
      status: message.status as ChatMessageStatus,
      localId: message.localId as string | undefined
    }))
  ];

  const items: ChatItem[] = [];
  let previous: (typeof entries)[number] | null = null;

  for (const entry of entries) {
    const dayKey = madridDayKey(entry.createdAt);

    if (!previous || madridDayKey(previous.createdAt) !== dayKey) {
      items.push({ kind: 'day', key: `day-${dayKey}`, label: formatChatDayLabel(entry.createdAt, now) });
      previous = null;
    }

    const startsGroup =
      !previous ||
      previous.mine !== entry.mine ||
      new Date(entry.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_GAP_MS;

    items.push({ kind: 'message', ...entry, startsGroup });
    previous = entry;
  }

  return items;
}
