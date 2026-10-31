import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { configureTestEnv, createAuthUser, createTestApp, resetDatabase, tokenFor, withDb } from './e2e/setup';

configureTestEnv();

const OWNER_ID = 'c0000000-0000-4000-8000-000000000001';
const DRIVER_ID = 'c0000000-0000-4000-8000-000000000002';
const STRANGER_ID = 'c0000000-0000-4000-8000-000000000003';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Chat de reservas e2e (/api/booking-messages)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let driverToken: string;
  let strangerToken: string;
  let vehicleId: string;
  let bookingId: string;

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function insertBooking(status: string): Promise<string> {
    const start = new Date(Date.now() + 10 * DAY_MS);
    const end = new Date(start.getTime() + 2 * DAY_MS);
    const rows = await withDb((client) =>
      client.query(
        `INSERT INTO bookings (vehicle_id, driver_id, start_datetime, end_datetime, price_per_day_at_booking, total_price, status)
         VALUES ($1, $2, $3, $4, 50, 100, $5) RETURNING id`,
        [vehicleId, DRIVER_ID, start.toISOString(), end.toISOString(), status]
      )
    );
    return rows.rows[0].id;
  }

  beforeAll(async () => {
    await resetDatabase();
    await createAuthUser(OWNER_ID, 'Olga', 'Owner');
    await createAuthUser(DRIVER_ID, 'Diego', 'Driver');
    await createAuthUser(STRANGER_ID, 'Sara', 'Stranger');

    ownerToken = await tokenFor(OWNER_ID);
    driverToken = await tokenFor(DRIVER_ID);
    strangerToken = await tokenFor(STRANGER_ID);

    app = await createTestApp();

    const vehicle = await api()
      .post('/api/vehicles')
      .set(auth(ownerToken))
      .send({
        brand: 'Seat',
        model: 'Ibiza',
        year: 2020,
        licensePlate: '3333CCC',
        description: 'Vehiculo e2e chat',
        pricePerDay: 50,
        locationLat: 38.3452,
        locationLng: -0.481,
        locationAddress: 'Alicante',
        status: 'active'
      })
      .expect(201);
    vehicleId = vehicle.body.id;
    bookingId = await insertBooking('pending');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requiere JWT', async () => {
    await api().get('/api/booking-messages').query({ bookingId }).expect(401);
    await api().post('/api/booking-messages').send({ bookingId, body: 'hola' }).expect(401);
  });

  it('conversación entre conductor y propietario con no leídos y lectura', async () => {
    const empty = await api().get('/api/booking-messages').query({ bookingId }).set(auth(driverToken)).expect(200);
    expect(empty.body).toEqual({ messages: [], hasMore: false, canSend: true, sendBlockedReason: null });

    const first = await api()
      .post('/api/booking-messages')
      .set(auth(driverToken))
      .send({ bookingId, body: '  Hola, ¿dónde recojo las llaves?  ' })
      .expect(201);
    expect(first.body).toMatchObject({ bookingId, senderId: DRIVER_ID, body: 'Hola, ¿dónde recojo las llaves?', readAt: null });

    await api().post('/api/booking-messages').set(auth(driverToken)).send({ bookingId, body: 'Llego a las 10' }).expect(201);

    const unread = await api().get('/api/booking-messages/unread').set(auth(ownerToken)).expect(200);
    expect(unread.body).toEqual({ total: 2, bookings: [{ bookingId, unread: 2 }] });

    const driverUnread = await api().get('/api/booking-messages/unread').set(auth(driverToken)).expect(200);
    expect(driverUnread.body).toEqual({ total: 0, bookings: [] });

    const reply = await api().post('/api/booking-messages').set(auth(ownerToken)).send({ bookingId, body: 'En el portal' }).expect(201);

    const read = await api().post('/api/booking-messages/read').set(auth(ownerToken)).send({ bookingId }).expect(200);
    expect(read.body).toEqual({ updated: 2 });
    expect((await api().get('/api/booking-messages/unread').set(auth(ownerToken))).body.total).toBe(0);

    const all = await api().get('/api/booking-messages').query({ bookingId }).set(auth(ownerToken)).expect(200);
    expect(all.body.messages.map((m: { body: string }) => m.body)).toEqual([
      'Hola, ¿dónde recojo las llaves?',
      'Llego a las 10',
      'En el portal'
    ]);
    expect(all.body.messages[0].readAt).not.toBeNull();

    // Polling: solo los posteriores al último conocido.
    const newer = await api()
      .get('/api/booking-messages')
      .query({ bookingId, after: first.body.id })
      .set(auth(driverToken))
      .expect(200);
    expect(newer.body.messages.map((m: { id: string }) => m.id)).toContain(reply.body.id);
    expect(newer.body.messages).toHaveLength(2);

    // Paginación hacia atrás.
    const lastPage = await api().get('/api/booking-messages').query({ bookingId, limit: 1 }).set(auth(driverToken)).expect(200);
    expect(lastPage.body).toMatchObject({ hasMore: true });
    const older = await api()
      .get('/api/booking-messages')
      .query({ bookingId, before: lastPage.body.messages[0].id, limit: 5 })
      .set(auth(driverToken))
      .expect(200);
    expect(older.body.messages).toHaveLength(2);
    expect(older.body.hasMore).toBe(false);
  });

  it('valida el cuerpo y los parámetros', async () => {
    await api().post('/api/booking-messages').set(auth(driverToken)).send({ bookingId, body: '' }).expect(400);
    await api().post('/api/booking-messages').set(auth(driverToken)).send({ bookingId, body: '   ' }).expect(400);
    await api().post('/api/booking-messages').set(auth(driverToken)).send({ bookingId, body: 'x'.repeat(2001) }).expect(400);
    await api().post('/api/booking-messages').set(auth(driverToken)).send({ bookingId: 'no-uuid', body: 'hola' }).expect(400);
    await api().get('/api/booking-messages').query({ bookingId, limit: 500 }).set(auth(driverToken)).expect(400);
    await api().get('/api/booking-messages').set(auth(driverToken)).expect(400);
  });

  it('un tercero no puede leer ni escribir', async () => {
    await api().get('/api/booking-messages').query({ bookingId }).set(auth(strangerToken)).expect(403);
    await api().post('/api/booking-messages').set(auth(strangerToken)).send({ bookingId, body: 'hola' }).expect(403);
    await api().post('/api/booking-messages/read').set(auth(strangerToken)).send({ bookingId }).expect(403);
  });

  it('en reservas cerradas se puede leer pero no escribir', async () => {
    const cancelledId = await insertBooking('cancelled');

    const page = await api().get('/api/booking-messages').query({ bookingId: cancelledId }).set(auth(driverToken)).expect(200);
    expect(page.body.canSend).toBe(false);
    expect(page.body.sendBlockedReason).toEqual(expect.any(String));

    await api().post('/api/booking-messages').set(auth(driverToken)).send({ bookingId: cancelledId, body: 'hola' }).expect(403);
  });

  it('tras completar, el chat sigue abierto unos días', async () => {
    const completedId = await insertBooking('completed');

    await api().post('/api/booking-messages').set(auth(ownerToken)).send({ bookingId: completedId, body: 'Gracias' }).expect(201);

    await withDb((client) =>
      client.query(`UPDATE booking_status_history SET changed_at = NOW() - INTERVAL '8 days' WHERE booking_id = $1`, [completedId])
    );

    await api().post('/api/booking-messages').set(auth(ownerToken)).send({ bookingId: completedId, body: 'Otra' }).expect(403);
  });

  it('exporta los mensajes propios en el RGPD', async () => {
    const res = await api().get('/api/users/me/export').set(auth(driverToken)).expect(200);

    expect(res.body.messagesSent.map((m: { body: string }) => m.body)).toEqual(
      expect.arrayContaining(['Hola, ¿dónde recojo las llaves?', 'Llego a las 10'])
    );
    expect(res.body.messagesSent.some((m: { body: string }) => m.body === 'En el portal')).toBe(false);
  });
});
