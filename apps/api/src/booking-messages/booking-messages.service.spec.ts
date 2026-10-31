import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingChatRow, BookingMessagesService } from './booking-messages.service';

const OWNER = 'owner-1';
const DRIVER = 'driver-1';
const STRANGER = 'other-1';
const DAY_MS = 24 * 60 * 60 * 1000;

const baseBooking: BookingChatRow = {
  booking_id: 'b1',
  owner_id: OWNER,
  driver_id: DRIVER,
  status: 'accepted',
  completed_at: null,
  owner_deleted: false,
  driver_deleted: false
};

const message = (id: string, senderId = DRIVER) => ({
  id,
  booking_id: 'b1',
  sender_id: senderId,
  body: `texto ${id}`,
  created_at: new Date('2026-10-31T10:00:00Z'),
  read_at: null
});

function buildService(options: { booking?: BookingChatRow | null; rows?: unknown[]; cursorExists?: boolean } = {}) {
  const booking = options.booking === undefined ? baseBooking : options.booking;
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM bookings b')) return booking ? [booking] : [];
      if (sql.startsWith('SELECT 1 FROM booking_messages')) return options.cursorExists === false ? [] : [{}];
      if (sql.startsWith('INSERT INTO booking_messages')) return [message('new', params[1] as string)];
      if (sql.startsWith('UPDATE booking_messages')) return [[], 3];
      if (sql.includes('GROUP BY m.booking_id')) return [{ booking_id: 'b1', unread: 2 }, { booking_id: 'b2', unread: '1' }];
      return options.rows ?? [];
    })
  };
  const push = { notifyMessage: jest.fn() };
  return { service: new BookingMessagesService(dataSource as never, push as never), queries, push };
}

describe('BookingMessagesService', () => {
  it('lista los últimos mensajes en orden ascendente e indica si hay más', async () => {
    const { service, queries } = buildService({ rows: [message('3'), message('2'), message('1')] });

    const page = await service.list(DRIVER, { bookingId: 'b1', limit: 2 });

    expect(page.messages.map((m) => m.id)).toEqual(['2', '3']);
    expect(page.hasMore).toBe(true);
    expect(page.canSend).toBe(true);
    expect(queries.at(-1)?.sql).toContain('ORDER BY created_at DESC');
  });

  it('con after pide solo los nuevos en orden ascendente', async () => {
    const { service, queries } = buildService({ rows: [message('4')] });

    const page = await service.list(OWNER, { bookingId: 'b1', after: 'm-3', limit: 50 });

    expect(page.messages.map((m) => m.id)).toEqual(['4']);
    expect(page.hasMore).toBe(false);
    expect(queries.at(-1)?.sql).toContain('(created_at, id) >');
    expect(queries.at(-1)?.sql).toContain('ORDER BY created_at ASC');
  });

  it('rechaza un cursor de otra reserva o after y before a la vez', async () => {
    await expect(buildService({ cursorExists: false }).service.list(DRIVER, { bookingId: 'b1', before: 'x', limit: 10 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(buildService().service.list(DRIVER, { bookingId: 'b1', after: 'a', before: 'b', limit: 10 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo los participantes acceden a la conversación', async () => {
    await expect(buildService().service.list(STRANGER, { bookingId: 'b1', limit: 10 })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(buildService({ booking: null }).service.list(DRIVER, { bookingId: 'b1', limit: 10 })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('envía un mensaje recortado y avisa por push a la otra parte', async () => {
    const { service, queries, push } = buildService();

    const created = await service.create(DRIVER, { bookingId: 'b1', body: '  hola  ' });

    expect(created).toMatchObject({ id: 'new', senderId: DRIVER });
    expect(queries.find((q) => q.sql.startsWith('INSERT'))?.params).toEqual(['b1', DRIVER, 'hola']);
    expect(push.notifyMessage).toHaveBeenCalledWith('b1', DRIVER, OWNER, 'hola');
  });

  it('rechaza mensajes vacíos o demasiado largos', async () => {
    const { service } = buildService();

    await expect(service.create(DRIVER, { bookingId: 'b1', body: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(DRIVER, { bookingId: 'b1', body: 'x'.repeat(2001) })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('no permite escribir en reservas cerradas', async () => {
    const { service, push } = buildService({ booking: { ...baseBooking, status: 'cancelled' } });

    await expect(service.create(OWNER, { bookingId: 'b1', body: 'hola' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(push.notifyMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', null, true],
    ['in_progress', null, true],
    ['rejected', null, false],
    ['cancelled', null, false],
    ['completed', 2, true],
    ['completed', 8, false],
    ['completed', undefined, false]
  ] as const)('estado %s (completada hace %s días) -> puede escribir: %s', (status, daysAgo, expected) => {
    const now = new Date('2026-10-31T12:00:00Z');
    const completedAt = typeof daysAgo === 'number' ? new Date(now.getTime() - daysAgo * DAY_MS) : null;
    const { service } = buildService();

    const reason = service.sendBlockedReason({ ...baseBooking, status, completed_at: completedAt }, DRIVER, now);

    expect(reason === null).toBe(expected);
  });

  it('no permite escribir si la otra parte borró su cuenta', () => {
    const { service } = buildService();

    expect(service.sendBlockedReason({ ...baseBooking, owner_deleted: true }, DRIVER)).toContain('eliminado');
  });

  it('marca como leídos solo los mensajes recibidos', async () => {
    const { service, queries } = buildService();

    expect(await service.markRead(OWNER, 'b1')).toEqual({ updated: 3 });
    const update = queries.find((q) => q.sql.startsWith('UPDATE booking_messages'));
    expect(update?.sql).toContain('sender_id <> $2');
    expect(update?.params).toEqual(['b1', OWNER]);
  });

  it('agrega los no leídos por reserva', async () => {
    const { service } = buildService();

    expect(await service.unread(OWNER)).toEqual({
      total: 3,
      bookings: [
        { bookingId: 'b1', unread: 2 },
        { bookingId: 'b2', unread: 1 }
      ]
    });
  });
});
