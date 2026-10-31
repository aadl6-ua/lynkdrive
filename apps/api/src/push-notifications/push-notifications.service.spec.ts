import { EXPO_PUSH_URL, PushNotificationsService } from './push-notifications.service';

const OWNER = 'owner-1';
const DRIVER = 'driver-1';

const bookingRow = {
  id: 'b1',
  status: 'pending',
  brand: 'Seat',
  model: 'Ibiza',
  owner_id: OWNER,
  driver_id: DRIVER,
  owner_first_name: 'Olga',
  driver_first_name: 'Diego'
};

type Tokens = Array<{ user_id: string; token: string }>;

function buildService(tokens: Tokens = [], booking: typeof bookingRow | null = bookingRow) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM bookings b')) return booking ? [booking] : [];
      if (sql.includes('SELECT user_id, token FROM push_tokens')) {
        const ids = params[0] as string[];
        return tokens.filter((row) => ids.includes(row.user_id));
      }
      return [];
    })
  };
  return { service: new PushNotificationsService(dataSource as never), queries };
}

function mockFetch(tickets: unknown[], ok = true, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok, status, json: async () => ({ data: tickets }) });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('PushNotificationsService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.PUSH_NOTIFICATIONS_ENABLED;
    delete process.env.EXPO_ACCESS_TOKEN;
  });

  it('registra el token con upsert por token', async () => {
    const { service, queries } = buildService();

    await service.registerToken(DRIVER, 'ExponentPushToken[abc]', 'ios');

    expect(queries[0].sql).toContain('ON CONFLICT (token) DO UPDATE');
    expect(queries[0].params).toEqual([DRIVER, 'ExponentPushToken[abc]', 'ios']);
  });

  it('solo borra tokens del propio usuario', async () => {
    const { service, queries } = buildService();

    await service.removeToken(DRIVER, 'ExponentPushToken[abc]');

    expect(queries[0].sql).toContain('user_id = $1 AND token = $2');
  });

  it('nueva solicitud: notifica solo al propietario con el id de la reserva', async () => {
    const fetchMock = mockFetch([{ status: 'ok' }]);
    const { service } = buildService([
      { user_id: OWNER, token: 'ExponentPushToken[owner]' },
      { user_id: DRIVER, token: 'ExponentPushToken[driver]' }
    ]);

    const sent = await service.send('requested', 'b1');

    expect(sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(EXPO_PUSH_URL, expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[owner]',
        title: 'Nueva solicitud de reserva',
        data: { type: 'booking', bookingId: 'b1', event: 'requested' }
      })
    ]);
    expect(body[0].body).toContain('Diego');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('envía EXPO_ACCESS_TOKEN como Bearer si está configurado', async () => {
    process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
    const fetchMock = mockFetch([{ status: 'ok' }]);
    const { service } = buildService([{ user_id: DRIVER, token: 'ExponentPushToken[driver]' }]);

    await service.send('accepted', 'b1');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-access-token');
  });

  it.each([
    ['requested', undefined, ['owner']],
    ['accepted', OWNER, ['driver']],
    ['rejected', OWNER, ['driver']],
    ['paid_confirmed', DRIVER, ['owner']],
    ['in_progress', DRIVER, ['owner']],
    ['in_progress', OWNER, ['driver']],
    ['cancelled', DRIVER, ['owner']],
    ['cancelled', OWNER, ['driver']],
    ['completed', OWNER, ['owner', 'driver']]
  ] as const)('evento %s (actor %s) -> %j', (event, actor, expected) => {
    const { service } = buildService();
    expect(service.recipientsFor(event, bookingRow, actor)).toEqual(expected);
  });

  it('completada: ambos reciben la invitación a valorar', async () => {
    const fetchMock = mockFetch([{ status: 'ok' }, { status: 'ok' }]);
    const { service } = buildService([
      { user_id: OWNER, token: 'ExponentPushToken[owner]' },
      { user_id: DRIVER, token: 'ExponentPushToken[driver]' }
    ]);

    await service.send('completed', 'b1', OWNER);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Array<{ to: string; body: string }>;
    expect(body.find((m) => m.to === 'ExponentPushToken[owner]')?.body).toContain('valorar a Diego');
    expect(body.find((m) => m.to === 'ExponentPushToken[driver]')?.body).toContain('valorar a Olga');
  });

  it('borra los tokens marcados como DeviceNotRegistered', async () => {
    mockFetch([{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok' }]);
    const { service, queries } = buildService([
      { user_id: OWNER, token: 'ExponentPushToken[old]' },
      { user_id: OWNER, token: 'ExponentPushToken[new]' }
    ]);

    const sent = await service.send('requested', 'b1');

    expect(sent).toBe(1);
    const deletion = queries.find((q) => q.sql.includes('DELETE FROM push_tokens WHERE token = ANY'));
    expect(deletion?.params).toEqual([['ExponentPushToken[old]']]);
  });

  it('no llama a Expo si el destinatario no tiene tokens', async () => {
    const fetchMock = mockFetch([]);
    const { service } = buildService([{ user_id: DRIVER, token: 'ExponentPushToken[driver]' }]);

    expect(await service.send('requested', 'b1')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no envía nada si la reserva no existe', async () => {
    const fetchMock = mockFetch([]);
    const { service } = buildService([{ user_id: OWNER, token: 'ExponentPushToken[owner]' }], null);

    expect(await service.send('requested', 'b1')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notify no lanza aunque Expo falle y no registra datos personales', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { service } = buildService([{ user_id: OWNER, token: 'ExponentPushToken[owner]' }]);
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    expect(() => service.notify('requested', 'b1')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toMatch(/ExponentPushToken|Olga|Diego|b1/);
  });

  it('con PUSH_NOTIFICATIONS_ENABLED=false no consulta ni envía', () => {
    process.env.PUSH_NOTIFICATIONS_ENABLED = 'false';
    const fetchMock = mockFetch([]);
    const { service, queries } = buildService([{ user_id: OWNER, token: 'ExponentPushToken[owner]' }]);

    service.notify('requested', 'b1');

    expect(queries).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respuesta no OK de Expo: no borra tokens ni lanza', async () => {
    mockFetch([], false, 500);
    const { service, queries } = buildService([{ user_id: OWNER, token: 'ExponentPushToken[owner]' }]);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    expect(await service.send('requested', 'b1')).toBe(0);
    expect(queries.some((q) => q.sql.includes('DELETE'))).toBe(false);
  });
});
