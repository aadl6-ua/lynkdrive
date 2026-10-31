import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { configureTestEnv, createAuthUser, createTestApp, resetDatabase, tokenFor, withDb } from './e2e/setup';

configureTestEnv();

const ADMIN_ID = 'b0000000-0000-4000-8000-000000000001';
const OWNER_ID = 'b0000000-0000-4000-8000-000000000002';
const DRIVER_ID = 'b0000000-0000-4000-8000-000000000003';
const VEHICLE_ID = 'b0000000-0000-4000-8000-0000000000a1';
const BOOKING_ID = 'b0000000-0000-4000-8000-0000000000b1';
const REVIEW_ID = 'b0000000-0000-4000-8000-0000000000c1';

describe('Backoffice admin e2e', () => {
  let app: INestApplication;
  let adminToken: string;
  let ownerToken: string;
  let driverToken: string;

  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    await resetDatabase();
    await createAuthUser(ADMIN_ID, 'Ada', 'Admin');
    await createAuthUser(OWNER_ID, 'Olga', 'Owner');
    await createAuthUser(DRIVER_ID, 'Diego', 'Driver');

    await withDb(async (client) => {
      await client.query(`UPDATE users SET is_admin = TRUE WHERE id = $1`, [ADMIN_ID]);
      await client.query(`UPDATE users SET is_verified = FALSE, id_document_url = 'supabase://documents/x/id.jpg',
                            driver_license_url = 'supabase://documents/x/dl.jpg' WHERE id = $1`, [DRIVER_ID]);
      await client.query(
        `INSERT INTO vehicles (id, owner_id, brand, model, year, license_plate, description, price_per_day, location, location_address)
         VALUES ($1, $2, 'Seat', 'Ibiza', 2020, 'ADM0001', 'Vehiculo admin e2e', 40, ST_SetSRID(ST_MakePoint(-0.48, 38.34), 4326), 'Alicante')`,
        [VEHICLE_ID, OWNER_ID]
      );
      await client.query(
        `INSERT INTO bookings (id, vehicle_id, driver_id, start_datetime, end_datetime, price_per_day_at_booking, total_price)
         VALUES ($1, $2, $3, NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day', 40, 80)`,
        [BOOKING_ID, VEHICLE_ID, DRIVER_ID]
      );
      for (const status of ['accepted', 'paid_confirmed', 'in_progress', 'completed']) {
        await client.query(`UPDATE bookings SET status = $2 WHERE id = $1`, [BOOKING_ID, status]);
      }
      await client.query(
        `INSERT INTO reviews (id, booking_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, 1, 'ofensivo')`,
        [REVIEW_ID, BOOKING_ID, DRIVER_ID, OWNER_ID]
      );
    });

    adminToken = await tokenFor(ADMIN_ID);
    ownerToken = await tokenFor(OWNER_ID);
    driverToken = await tokenFor(DRIVER_ID);

    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exige token (401) y rol admin (403)', async () => {
    await api().get('/api/admin/dashboard').expect(401);
    await api().get('/api/admin/dashboard').set('Authorization', `Bearer ${ownerToken}`).expect(403);
  });

  it('devuelve el perfil del admin autenticado', async () => {
    const res = await asAdmin(api().get('/api/admin/me')).expect(200);
    expect(res.body).toMatchObject({ id: ADMIN_ID, isAdmin: true, email: `ada@e2e.test` });
  });

  it('calcula las métricas del dashboard', async () => {
    const res = await asAdmin(api().get('/api/admin/dashboard')).expect(200);

    expect(res.body.users).toMatchObject({ total: 3, pendingVerification: 1, blocked: 0 });
    expect(res.body.vehicles).toMatchObject({ total: 1, active: 1 });
    expect(res.body.bookings).toEqual({ total: 1, byStatus: { completed: 1 } });
    expect(res.body.revenue).toMatchObject({ gross: 80, paidBookings: 1, estimatedPlatformFees: 8 });
    expect(res.body.revenue.monthly).toHaveLength(6);
  });

  it('lista usuarios con paginación, filtros y validación de query', async () => {
    const page = await asAdmin(api().get('/api/admin/users?page=1&pageSize=2')).expect(200);
    expect(page.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.body.items).toHaveLength(2);

    const pending = await asAdmin(api().get('/api/admin/users?filter=pending_verification')).expect(200);
    expect(pending.body.items.map((user: { id: string }) => user.id)).toEqual([DRIVER_ID]);

    const search = await asAdmin(api().get('/api/admin/users?search=olga')).expect(200);
    expect(search.body.items.map((user: { id: string }) => user.id)).toEqual([OWNER_ID]);

    await asAdmin(api().get('/api/admin/users?pageSize=500')).expect(400);
    await asAdmin(api().get('/api/admin/users?filter=otro')).expect(400);
  });

  it('verifica la documentación de un usuario', async () => {
    const res = await asAdmin(api().put(`/api/admin/users/${DRIVER_ID}/verification`))
      .send({ isVerified: true })
      .expect(200);
    expect(res.body.isVerified).toBe(true);
    // Sin service role de Supabase no se pueden firmar URLs: se devuelve null en vez de fallar.
    expect(res.body.documents.idDocument).toEqual({ url: null, expiresAt: null });

    await asAdmin(api().put(`/api/admin/users/${DRIVER_ID}/verification`)).send({ isVerified: 'si' }).expect(400);
  });

  it('bloquea y desbloquea usuarios; el bloqueo corta el acceso a la API', async () => {
    await asAdmin(api().put(`/api/admin/users/${ADMIN_ID}/block`)).send({ blocked: true }).expect(400);

    const blocked = await asAdmin(api().put(`/api/admin/users/${DRIVER_ID}/block`))
      .send({ blocked: true, reason: 'Pruebas' })
      .expect(200);
    expect(blocked.body).toMatchObject({ blockedReason: 'Pruebas' });
    await api().get('/api/users/me').set('Authorization', `Bearer ${driverToken}`).expect(403);

    await asAdmin(api().put(`/api/admin/users/${DRIVER_ID}/block`)).send({ blocked: false }).expect(200);
    await api().get('/api/users/me').set('Authorization', `Bearer ${driverToken}`).expect(200);
  });

  it('activa y desactiva vehículos', async () => {
    const res = await asAdmin(api().put(`/api/admin/vehicles/${VEHICLE_ID}/status`))
      .send({ status: 'inactive' })
      .expect(200);
    expect(res.body).toMatchObject({ id: VEHICLE_ID, status: 'inactive', bookings: 1 });

    const list = await asAdmin(api().get('/api/admin/vehicles?status=inactive&search=ibiza')).expect(200);
    expect(list.body.total).toBe(1);

    await asAdmin(api().put(`/api/admin/vehicles/${VEHICLE_ID}/status`)).send({ status: 'active' }).expect(200);
  });

  it('oculta reseñas: dejan de contar en el perfil público', async () => {
    const before = await api().get(`/api/users/${OWNER_ID}/overview`).expect(200);
    expect(before.body.ratingsCount).toBe(1);

    const hidden = await asAdmin(api().put(`/api/admin/reviews/${REVIEW_ID}/visibility`))
      .send({ hidden: true, reason: 'Lenguaje ofensivo' })
      .expect(200);
    expect(hidden.body.hiddenAt).not.toBeNull();

    const after = await api().get(`/api/users/${OWNER_ID}/overview`).expect(200);
    expect(after.body.ratingsCount).toBe(0);

    const ownerView = await api().get(`/api/reviews?bookingId=${BOOKING_ID}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerView.body).toEqual([]);

    const list = await asAdmin(api().get('/api/admin/reviews?visibility=hidden')).expect(200);
    expect(list.body.items[0]).toMatchObject({ id: REVIEW_ID, hiddenReason: 'Lenguaje ofensivo' });
  });

  it('muestra la reserva con su historial de estados', async () => {
    const res = await asAdmin(api().get(`/api/admin/bookings/${BOOKING_ID}`)).expect(200);

    expect(res.body.history.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
      'pending',
      'accepted',
      'paid_confirmed',
      'in_progress',
      'completed'
    ]);
    expect(res.body).toMatchObject({ totalPrice: 80, reviewIds: [REVIEW_ID] });

    const list = await asAdmin(api().get('/api/admin/bookings?status=completed')).expect(200);
    expect(list.body.total).toBe(1);
    await asAdmin(api().get('/api/admin/bookings?status=inventado')).expect(400);
  });

  it('gestiona incidencias: crear, notas, cambio de estado y listado', async () => {
    await asAdmin(api().post('/api/admin/incidents')).send({ title: '' }).expect(400);

    const created = await asAdmin(api().post('/api/admin/incidents'))
      .send({ title: 'Rayón en puerta', description: 'El propietario reporta un rayón', bookingId: BOOKING_ID })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'open', bookingId: BOOKING_ID, createdBy: ADMIN_ID });

    const id = created.body.id as string;
    const withNote = await asAdmin(api().post(`/api/admin/incidents/${id}/notes`))
      .send({ body: 'Contactado el conductor' })
      .expect(201);
    expect(withNote.body.notes).toHaveLength(1);

    await asAdmin(api().put(`/api/admin/incidents/${id}/status`)).send({ status: 'cerrada' }).expect(400);
    const resolved = await asAdmin(api().put(`/api/admin/incidents/${id}/status`)).send({ status: 'resolved' }).expect(200);
    expect(resolved.body.status).toBe('resolved');

    const list = await asAdmin(api().get('/api/admin/incidents?status=resolved')).expect(200);
    expect(list.body.items[0]).toMatchObject({ id, notesCount: 1 });

    const booking = await asAdmin(api().get(`/api/admin/bookings/${BOOKING_ID}`)).expect(200);
    expect(booking.body.incidents).toHaveLength(1);
  });
});
