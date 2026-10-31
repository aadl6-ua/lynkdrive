import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { configureTestEnv, createAuthUser, createTestApp, resetDatabase, tokenFor, withDb } from './e2e/setup';

configureTestEnv();

const OWNER_ID = 'b0000000-0000-4000-8000-000000000001';
const DRIVER_ID = 'b0000000-0000-4000-8000-000000000002';
const OTHER_OWNER_ID = 'b0000000-0000-4000-8000-000000000003';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Mis ingresos e2e (GET /api/earnings/mine)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let driverToken: string;
  let otherOwnerToken: string;
  let vehicleId: string;
  let otherVehicleId: string;

  const api = () => request(app.getHttpServer());

  async function createVehicle(token: string, licensePlate: string): Promise<string> {
    const res = await api()
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        brand: 'Toyota',
        model: 'Corolla',
        year: 2021,
        licensePlate,
        description: 'Vehiculo e2e ingresos',
        pricePerDay: 50,
        locationLat: 38.3452,
        locationLng: -0.481,
        locationAddress: 'Alicante',
        status: 'active'
      })
      .expect(201);
    return res.body.id;
  }

  async function insertBooking(vid: string, status: string, daysAgo: number, total: number): Promise<void> {
    const start = new Date(Date.now() - daysAgo * DAY_MS);
    const end = new Date(start.getTime() + 2 * DAY_MS);
    await withDb((client) =>
      client.query(
        `INSERT INTO bookings (vehicle_id, driver_id, start_datetime, end_datetime, price_per_day_at_booking, total_price, status)
         VALUES ($1, $2, $3, $4, 50, $5, $6)`,
        [vid, DRIVER_ID, start.toISOString(), end.toISOString(), total, status]
      )
    );
  }

  beforeAll(async () => {
    await resetDatabase();
    await createAuthUser(OWNER_ID, 'Olga', 'Owner');
    await createAuthUser(DRIVER_ID, 'Diego', 'Driver');
    await createAuthUser(OTHER_OWNER_ID, 'Otto', 'Owner');

    ownerToken = await tokenFor(OWNER_ID);
    driverToken = await tokenFor(DRIVER_ID);
    otherOwnerToken = await tokenFor(OTHER_OWNER_ID);

    app = await createTestApp();

    vehicleId = await createVehicle(ownerToken, '1111AAA');
    otherVehicleId = await createVehicle(otherOwnerToken, '2222BBB');

    await insertBooking(vehicleId, 'completed', 400, 100);
    await insertBooking(vehicleId, 'paid_confirmed', 1, 80);
    await insertBooking(vehicleId, 'in_progress', 0, 60);
    // No cuentan: estados sin cobro.
    await insertBooking(vehicleId, 'pending', 2, 999);
    await insertBooking(vehicleId, 'accepted', 3, 999);
    await insertBooking(vehicleId, 'cancelled', 4, 999);
    await insertBooking(vehicleId, 'rejected', 5, 999);
    // Otro propietario.
    await insertBooking(otherVehicleId, 'completed', 1, 500);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requiere JWT', async () => {
    await api().get('/api/earnings/mine').expect(401);
  });

  it('devuelve solo los ingresos del propietario autenticado', async () => {
    const res = await api().get('/api/earnings/mine').set('Authorization', `Bearer ${ownerToken}`).expect(200);

    expect(res.body).toMatchObject({ currency: 'EUR', mode: 'prototype', feePercent: 10 });
    expect(res.body.summary.total).toEqual({ bookings: 3, grossAmount: 240, platformFee: 24, netAmount: 216 });
    expect(res.body.bookings).toHaveLength(3);
    expect(res.body.bookings.map((b: { status: string }) => b.status).sort()).toEqual([
      'completed',
      'in_progress',
      'paid_confirmed'
    ]);
    expect(res.body.bookings[0].driver).toEqual({ id: DRIVER_ID, displayName: 'Diego D.' });
    expect(res.body.byVehicle).toHaveLength(1);
    expect(res.body.byVehicle[0]).toMatchObject({ vehicleId, licensePlate: '1111AAA', bookings: 3, netAmount: 216 });
  });

  it('el rango filtra historial y desglose', async () => {
    const from = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const res = await api()
      .get('/api/earnings/mine')
      .query({ from })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.rangeTotals.bookings).toBe(2);
    expect(res.body.bookings).toHaveLength(2);
    expect(res.body.summary.total.bookings).toBe(3);
  });

  it('rechaza fechas invalidas', async () => {
    await api()
      .get('/api/earnings/mine')
      .query({ from: 'no-es-fecha' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('un usuario sin vehiculos recibe el panel vacio', async () => {
    const res = await api().get('/api/earnings/mine').set('Authorization', `Bearer ${driverToken}`).expect(200);

    expect(res.body.summary.total.bookings).toBe(0);
    expect(res.body.bookings).toEqual([]);
  });
});
