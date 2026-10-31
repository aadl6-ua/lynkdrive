import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { PaymentsService } from './payments.service';

const WEBHOOK_SECRET = 'whsec_test_secret';

/**
 * Usa un cliente Stripe real (sin red) para firmar y verificar eventos de prueba;
 * la BD se simula con un DataSource falso.
 */
describe('PaymentsService.handleWebhook', () => {
  const originalEnv = { ...process.env };
  const stripe = new Stripe('sk_test_dummy');

  const signedEvent = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return { body: Buffer.from(payload), header };
  };

  const succeededEvent = (metadata: Record<string, string> = { bookingId: 'booking-1' }) =>
    signedEvent({
      id: 'evt_1',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', object: 'payment_intent', status: 'succeeded', metadata } }
    });

  const createDataSource = (updateResult: unknown, statusResult: unknown = [{ status: 'paid_confirmed' }]) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("SET status = 'paid_confirmed'")) return updateResult;
      if (sql.includes('SELECT status FROM bookings')) return statusResult;
      if (sql.includes('SELECT id FROM bookings')) return [{ id: 'booking-from-lookup' }];
      return [];
    });
    return { dataSource: { query } as unknown as DataSource, query };
  };

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('moves an accepted booking to paid_confirmed on payment_intent.succeeded', async () => {
    const { dataSource, query } = createDataSource([[{ id: 'booking-1' }], 1]);
    const service = new PaymentsService(dataSource, stripe);
    const { body, header } = succeededEvent();

    await expect(service.handleWebhook(body, header)).resolves.toEqual({ received: true, handled: true });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $2 AND status = 'accepted'"), [
      'pi_1',
      'booking-1'
    ]);
  });

  it('is idempotent: a repeated event does not fail when booking is already paid', async () => {
    const { dataSource, query } = createDataSource([[], 0]);
    const service = new PaymentsService(dataSource, stripe);
    const { body, header } = succeededEvent();

    await expect(service.handleWebhook(body, header)).resolves.toEqual({ received: true, handled: true });
    await expect(service.handleWebhook(body, header)).resolves.toEqual({ received: true, handled: true });

    const updates = query.mock.calls.filter(([sql]) => String(sql).includes("SET status = 'paid_confirmed'"));
    expect(updates).toHaveLength(2);
  });

  it('finds the booking by payment_intent_id when metadata is missing', async () => {
    const { dataSource, query } = createDataSource([[{ id: 'booking-from-lookup' }], 1]);
    const service = new PaymentsService(dataSource, stripe);
    const { body, header } = succeededEvent({});

    await service.handleWebhook(body, header);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'paid_confirmed'"), [
      'pi_1',
      'booking-from-lookup'
    ]);
  });

  it('rejects an invalid signature', async () => {
    const { dataSource, query } = createDataSource([]);
    const service = new PaymentsService(dataSource, stripe);
    const { body } = succeededEvent();

    await expect(service.handleWebhook(body, 't=1,v1=bad')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header', async () => {
    const { dataSource } = createDataSource([]);
    const service = new PaymentsService(dataSource, stripe);
    const { body } = succeededEvent();

    await expect(service.handleWebhook(body, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acknowledges unrelated events without touching bookings', async () => {
    const { dataSource, query } = createDataSource([]);
    const service = new PaymentsService(dataSource, stripe);
    const { body, header } = signedEvent({
      id: 'evt_2',
      object: 'event',
      type: 'customer.created',
      data: { object: { id: 'cus_1', object: 'customer' } }
    });

    await expect(service.handleWebhook(body, header)).resolves.toEqual({ received: true, handled: false });
    expect(query).not.toHaveBeenCalled();
  });

  it('is unavailable in prototype mode (no Stripe client) or without webhook secret', async () => {
    const { dataSource } = createDataSource([]);
    const { body, header } = succeededEvent();

    await expect(new PaymentsService(dataSource, null).handleWebhook(body, header)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );

    delete process.env.STRIPE_WEBHOOK_SECRET;
    await expect(new PaymentsService(dataSource, stripe).handleWebhook(body, header)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
