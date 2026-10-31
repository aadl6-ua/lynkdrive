import { buildChatItems, formatChatDayLabel, mergeMessages } from '../chatMessages';
import type { BookingMessage } from '../messagesApi';

const ME = 'me';
const OTHER = 'other';

const message = (id: string, createdAt: string, senderId = OTHER, readAt: string | null = null): BookingMessage => ({
  id,
  bookingId: 'b1',
  senderId,
  body: `texto ${id}`,
  createdAt,
  readAt
});

describe('mergeMessages', () => {
  it('une sin duplicados, ordena por fecha y actualiza los existentes', () => {
    const current = [message('a', '2026-10-31T10:00:00Z'), message('b', '2026-10-31T10:05:00Z', ME)];
    const merged = mergeMessages(current, [
      message('c', '2026-10-31T09:00:00Z'),
      message('b', '2026-10-31T10:05:00Z', ME, '2026-10-31T10:06:00Z')
    ]);

    expect(merged.map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(merged[2].readAt).toBe('2026-10-31T10:06:00Z');
  });

  it('devuelve la misma referencia si no llega nada nuevo', () => {
    const current = [message('a', '2026-10-31T10:00:00Z')];
    expect(mergeMessages(current, [])).toBe(current);
  });
});

describe('formatChatDayLabel (Europe/Madrid)', () => {
  const now = new Date('2026-10-31T12:00:00Z');

  it('usa Hoy y Ayer según el día en Madrid, no en UTC ni en el dispositivo', () => {
    expect(formatChatDayLabel('2026-10-31T08:00:00Z', now)).toBe('Hoy');
    // 23:30 UTC del día 30 ya es día 31 en Madrid (UTC+1 en invierno).
    expect(formatChatDayLabel('2026-10-30T23:30:00Z', now)).toBe('Hoy');
    expect(formatChatDayLabel('2026-10-30T10:00:00Z', now)).toBe('Ayer');
    expect(formatChatDayLabel('2026-10-20T10:00:00Z', now)).toMatch(/20/);
  });
});

describe('buildChatItems', () => {
  const now = new Date('2026-10-31T12:00:00Z');

  it('inserta separadores de día y agrupa mensajes seguidos del mismo autor', () => {
    const items = buildChatItems(
      [
        message('a', '2026-10-30T10:00:00Z'),
        message('b', '2026-10-31T10:00:00Z'),
        message('c', '2026-10-31T10:01:00Z'),
        message('d', '2026-10-31T10:02:00Z', ME, '2026-10-31T10:03:00Z')
      ],
      [{ localId: 'tmp-1', body: 'pendiente', createdAt: '2026-10-31T10:04:00Z', status: 'sending' }],
      ME,
      now
    );

    expect(items.map((item) => (item.kind === 'day' ? item.label : item.key))).toEqual([
      'Ayer',
      'a',
      'Hoy',
      'b',
      'c',
      'd',
      'tmp-1'
    ]);

    const byKey = Object.fromEntries(items.filter((i) => i.kind === 'message').map((i) => [i.key, i]));
    expect(byKey.b).toMatchObject({ startsGroup: true, mine: false, status: 'sent' });
    expect(byKey.c).toMatchObject({ startsGroup: false });
    expect(byKey.d).toMatchObject({ startsGroup: true, mine: true, status: 'read' });
    expect(byKey['tmp-1']).toMatchObject({ startsGroup: false, mine: true, status: 'sending', localId: 'tmp-1' });
  });

  it('separa en grupos si pasan más de 5 minutos', () => {
    const items = buildChatItems(
      [message('a', '2026-10-31T10:00:00Z'), message('b', '2026-10-31T10:10:00Z')],
      [],
      ME,
      now
    );

    expect(items.filter((i) => i.kind === 'message').map((i) => i.kind === 'message' && i.startsGroup)).toEqual([true, true]);
  });
});
