import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { configureTestEnv, createAuthUser, createTestApp, resetDatabase, tokenFor, withDb } from './e2e/setup';

configureTestEnv();

const OWNER_ID = 'a0000000-0000-4000-8000-000000000001';
const DRIVER_ID = 'a0000000-0000-4000-8000-000000000002';
const DRIVER2_ID = 'a0000000-0000-4000-8000-000000000003';
const STRANGER_ID = 'a0000000-0000-4000-8000-000000000004';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function futureDate(daysFromNow: number, hour = 10): string {
  const date = new Date(Date.now() + daysFromNow * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

describe('API e2e (Postgres + PostGIS)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let driverToken: string;
  let driver2Token: string;
  let strangerToken: string;
  let vehicleId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase();
    await createAuthUser(OWNER_ID, 'Olga', 'Owner');
    await createAuthUser(DRIVER_ID, 'Diego', 'Driver');
    await createAuthUser(DRIVER2_ID, 'Dora', 'Driver');
    await createAuthUser(STRANGER_ID, 'Sergio', 'Stranger');

    ownerToken = await tokenFor(OWNER_ID);
    driverToken = await tokenFor(DRIVER_ID);
    driver2Token = await tokenFor(DRIVER2_ID);
    strangerToken = await tokenFor(STRANGER_ID);

    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('auth', () => {
    it('el trigger auth.users -> public.users crea el perfil', async () => {
      const res = await api().get('/api/users/me').set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(res.body).toMatchObject({ id: OWNER_ID, firstName: 'Olga', lastName: 'Owner' });
    });

    it('rechaza peticiones sin token o con token invalido', async () => {
      await api().get('/api/bookings/mine/as-driver').expect(401);
      await api().get('/api/bookings/mine/as-driver').set('Authorization', 'Bearer invalid.token.value').expect(401);
    });
  });

  describe('vehiculos y busqueda geoespacial', () => {
    it('el owner publica un vehiculo con disponibilidad', async () => {
      const vehicleRes = await api()
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          brand: 'Toyota',
          model: 'Corolla',
          year: 2021,
          licensePlate: '1234ABC',
          description: 'Vehiculo e2e',
          pricePerDay: 60,
          locationLat: 38.3452,
          locationLng: -0.481,
          locationAddress: 'Alicante',
          fuelType: 'hybrid',
          transmission: 'automatic',
          seats: 5,
          status: 'active'
        })
        .expect(201);

      vehicleId = vehicleRes.body.id;
      expect(vehicleRes.body.ownerId).toBe(OWNER_ID);

      await api()
        .post('/api/vehicle-availability-windows')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ vehicleId, startDatetime: futureDate(1, 0), endDatetime: futureDate(60, 0) })
        .expect(201);
    });

    it('encuentra el vehiculo dentro del radio y no fuera de el', async () => {
      const near = await api().get('/api/vehicles').query({ lat: 38.35, lng: -0.49, radiusKm: 5 }).expect(200);
      expect(near.body.map((v: { id: string }) => v.id)).toContain(vehicleId);

      const far = await api().get('/api/vehicles').query({ lat: 40.4168, lng: -3.7038, radiusKm: 5 }).expect(200);
      expect(far.body.map((v: { id: string }) => v.id)).not.toContain(vehicleId);
    });
  });

  describe('flujo completo de reserva', () => {
    let bookingA: string;
    let bookingB: string;
    let bookingC: string;

    it('los conductores crean solicitudes pending (con solapes permitidos)', async () => {
      const resA = await api()
        .post('/api/bookings')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ vehicleId, startDatetime: futureDate(10), endDatetime: futureDate(12) })
        .expect(201);

      const resB = await api()
        .post('/api/bookings')
        .set('Authorization', `Bearer ${driver2Token}`)
        .send({ vehicleId, startDatetime: futureDate(11), endDatetime: futureDate(13) })
        .expect(201);

      const resC = await api()
        .post('/api/bookings')
        .set('Authorization', `Bearer ${driver2Token}`)
        .send({ vehicleId, startDatetime: futureDate(20), endDatetime: futureDate(21) })
        .expect(201);

      bookingA = resA.body.id;
      bookingB = resB.body.id;
      bookingC = resC.body.id;

      expect(resA.body).toMatchObject({ status: 'pending', pricePerDayAtBooking: 60, totalPrice: 120 });
    });

    it('el owner no puede reservar su propio vehiculo', async () => {
      await api()
        .post('/api/bookings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ vehicleId, startDatetime: futureDate(30), endDatetime: futureDate(31) })
        .expect(400);
    });

    it('un tercero no puede ver ni modificar la reserva', async () => {
      await api().get(`/api/bookings/${bookingA}`).set('Authorization', `Bearer ${strangerToken}`).expect(403);
      await api()
        .put(`/api/bookings/${bookingA}/status`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ status: 'cancelled' })
        .expect(403);
    });

    it('el driver no puede aceptar su propia solicitud', async () => {
      await api()
        .put(`/api/bookings/${bookingA}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'accepted' })
        .expect(400);
    });

    it('al aceptar una solicitud se rechazan las pending solapadas y se mantienen las demas', async () => {
      const res = await api()
        .put(`/api/bookings/${bookingA}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'accepted', ownerContactMethod: 'Tel 600 000 000' })
        .expect(200);

      expect(res.body).toMatchObject({ status: 'accepted', ownerContactMethod: 'Tel 600 000 000' });

      const b = await api().get(`/api/bookings/${bookingB}`).set('Authorization', `Bearer ${driver2Token}`).expect(200);
      const c = await api().get(`/api/bookings/${bookingC}`).set('Authorization', `Bearer ${driver2Token}`).expect(200);

      expect(b.body.status).toBe('rejected');
      expect(c.body.status).toBe('pending');
    });

    it('no admite nuevas solicitudes que solapen con una reserva aceptada', async () => {
      await api()
        .post('/api/bookings')
        .set('Authorization', `Bearer ${driver2Token}`)
        .send({ vehicleId, startDatetime: futureDate(11), endDatetime: futureDate(11, 18) })
        .expect(409);
    });

    it('el precio de la reserva queda congelado aunque cambie el precio del vehiculo', async () => {
      await api()
        .put(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ pricePerDay: 99 })
        .expect(200);

      const res = await api().get(`/api/bookings/${bookingA}`).set('Authorization', `Bearer ${driverToken}`).expect(200);
      expect(res.body).toMatchObject({ pricePerDayAtBooking: 60, totalPrice: 120 });
    });

    it('no permite reseñar ni hacer check-in antes de tiempo', async () => {
      await api()
        .post('/api/reviews')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, revieweeId: OWNER_ID, rating: 5 })
        .expect(400);

      await api()
        .post('/api/booking-checklists')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, type: 'check_in', mileage: 1000, fuelLevel: 80 })
        .expect(400);
    });

    it('solo el driver paga y el booking pasa a paid_confirmed (modo prototipo)', async () => {
      await api()
        .post(`/api/payments/bookings/${bookingA}/intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);

      const intent = await api()
        .post(`/api/payments/bookings/${bookingA}/intent`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      expect(intent.body).toMatchObject({ mode: 'prototype', amountCents: 12000, currency: 'eur' });

      const confirm = await api()
        .post(`/api/payments/bookings/${bookingA}/confirm`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({})
        .expect(201);

      expect(confirm.body.bookingStatus).toBe('paid_confirmed');
    });

    it('check-in permitido en paid_confirmed, check-out solo en curso', async () => {
      await api()
        .post('/api/booking-checklists')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, type: 'check_out', mileage: 1000, fuelLevel: 80 })
        .expect(400);

      const checkIn = await api()
        .post('/api/booking-checklists')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, type: 'check_in', mileage: 1000, fuelLevel: 80, notes: 'OK' })
        .expect(201);

      expect(checkIn.body).toMatchObject({ type: 'check_in', submittedBy: DRIVER_ID, fuelLevel: 80 });

      await api()
        .post('/api/booking-checklists')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, type: 'check_in', mileage: 1000, fuelLevel: 80 })
        .expect(409);

      await api()
        .post('/api/checklist-images')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ checklistId: checkIn.body.id, imageUrl: `supabase://checklists/checklist_image/${DRIVER_ID}/a.jpg` })
        .expect(201);

      // Una referencia a un fichero subido por otro usuario se rechaza.
      await api()
        .post('/api/checklist-images')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ checklistId: checkIn.body.id, imageUrl: `supabase://checklists/checklist_image/${OWNER_ID}/b.jpg` })
        .expect(400);

      await api()
        .put(`/api/bookings/${bookingA}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'in_progress' })
        .expect(200);

      await api()
        .post('/api/booking-checklists')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, type: 'check_out', mileage: 1350, fuelLevel: 40 })
        .expect(201);
    });

    it('in_progress no se puede cancelar y el owner completa el viaje', async () => {
      await api()
        .put(`/api/bookings/${bookingA}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'cancelled' })
        .expect(400);

      const res = await api()
        .put(`/api/bookings/${bookingA}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'completed' })
        .expect(200);

      expect(res.body.status).toBe('completed');
    });

    it('con el booking completado ambas partes se reseñan una sola vez', async () => {
      await api()
        .post('/api/reviews')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, revieweeId: OWNER_ID, rating: 5, comment: 'Genial' })
        .expect(201);

      await api()
        .post('/api/reviews')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ bookingId: bookingA, revieweeId: DRIVER_ID, rating: 4 })
        .expect(201);

      await api()
        .post('/api/reviews')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingA, revieweeId: OWNER_ID, rating: 3 })
        .expect(409);

      const count = await withDb(async (client) => {
        const result = await client.query('SELECT COUNT(*)::int AS n FROM reviews WHERE booking_id = $1', [bookingA]);
        return result.rows[0].n as number;
      });

      expect(count).toBe(2);
    });

    it('el driver puede cancelar una solicitud pending futura', async () => {
      const res = await api()
        .put(`/api/bookings/${bookingC}/status`)
        .set('Authorization', `Bearer ${driver2Token}`)
        .send({ status: 'cancelled' })
        .expect(200);

      expect(res.body.status).toBe('cancelled');
    });
  });
});
