import { BookingNotificationsService } from './booking-notifications.service';
import { MailerService } from './mailer.service';

const ENV_KEYS = ['EMAIL_PROVIDER', 'EMAIL_API_KEY', 'EMAIL_FROM', 'APP_PUBLIC_URL'] as const;

const bookingRow = {
  id: 'b1',
  start_datetime: new Date('2030-03-10T09:00:00Z'),
  end_datetime: new Date('2030-03-12T17:00:00Z'),
  total_price: '96.00',
  owner_contact_method: 'WhatsApp 600 000 000',
  brand: 'Seat',
  model: 'Ibiza',
  owner_id: 'owner-1',
  driver_id: 'driver-1',
  owner_first_name: 'Lucía',
  driver_first_name: 'Pablo',
  owner_email: 'lucia@example.com' as string | null,
  driver_email: 'pablo@example.com'
};

describe('notificaciones por email', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    ENV_KEYS.forEach((key) => delete process.env[key]);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    ENV_KEYS.forEach((key) => delete process.env[key]);
  });

  function configure(provider: 'resend' | 'brevo') {
    process.env.EMAIL_PROVIDER = provider;
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'LynkDrive <reservas@lynkdrive.es>';
  }

  function buildService(row: Partial<typeof bookingRow> | null = bookingRow) {
    const dataSource = { query: jest.fn().mockResolvedValue(row ? [{ ...bookingRow, ...row }] : []) };
    return { service: new BookingNotificationsService(dataSource as never, new MailerService()), dataSource };
  }

  it('sin configuración no consulta la BD ni envía nada', async () => {
    const { service, dataSource } = buildService();

    service.notify('accepted', 'b1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con Resend avisa al conductor de la aceptación con el contacto del propietario', async () => {
    configure('resend');
    const { service } = buildService();

    await expect(service.send('accepted', 'b1')).resolves.toBe(1);

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(body.to).toEqual(['pablo@example.com']);
    expect(body.subject).toBe('Lucía ha aceptado tu reserva');
    expect(body.text).toContain('WhatsApp 600 000 000');
    expect(body.text).toContain('96,00');
  });

  it('con Brevo separa nombre y email del remitente', async () => {
    configure('brevo');
    const { service } = buildService();

    await service.send('requested', 'b1');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
    expect(body.sender).toEqual({ name: 'LynkDrive', email: 'reservas@lynkdrive.es' });
    expect(body.to).toEqual([{ email: 'lucia@example.com' }]);
    expect(body.subject).toBe('Nueva solicitud para tu Seat Ibiza');
  });

  it('pago y viaje completado se notifican a ambas partes', async () => {
    configure('resend');
    const { service } = buildService();

    await expect(service.send('paid_confirmed', 'b1')).resolves.toBe(2);
    await expect(service.send('completed', 'b1')).resolves.toBe(2);
  });

  it('la cancelación se notifica a la otra parte', async () => {
    configure('resend');
    const { service } = buildService();

    await service.send('cancelled', 'b1', 'owner-1');
    await service.send('cancelled', 'b1', 'driver-1');

    const recipients = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).to[0]);
    expect(recipients).toEqual(['pablo@example.com', 'lucia@example.com']);
  });

  it('escapa el HTML de los datos del usuario y omite destinatarios sin email', async () => {
    configure('resend');
    const { service } = buildService({ driver_first_name: '<b>Pablo</b>', owner_email: null });

    await expect(service.send('paid_confirmed', 'b1')).resolves.toBe(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).not.toContain('<b>Pablo</b>');
    expect(body.html).toContain('&#60;b&#62;Pablo');
  });

  it('un fallo del proveedor no lanza error', async () => {
    configure('resend');
    fetchMock.mockRejectedValue(new Error('network'));
    const { service } = buildService();

    await expect(service.send('rejected', 'b1')).resolves.toBe(0);
  });
});
