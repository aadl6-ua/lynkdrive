import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { AuthUser } from 'src/auth/auth-user.type';
import { PaymentsService } from './payments.service';

const DRIVER: AuthUser = { sub: 'driver-1', email: 'driver@test.dev', claims: {} };
const OWNER: AuthUser = { sub: 'owner-1', email: 'owner@test.dev', claims: {} };

const bookingRow = (overrides: Record<string, unknown> = {}) => ({
  booking_id: 'booking-1',
  booking_status: 'accepted',
  vehicle_id: 'vehicle-1',
  owner_id: OWNER.sub,
  driver_id: DRIVER.sub,
  total_price: '120.50',
  start_datetime: new Date('2030-01-10T10:00:00Z'),
  payment_intent_id: null,
  payout_status: 'pending',
  ...overrides
});

type QueryMock = jest.Mock<Promise<unknown>, [string, unknown[]?]>;

/**
 * DataSource falso: enruta cada SQL a un handler según su contenido.
 */
const createDataSource = (handlers: { match: RegExp; result: unknown }[]) => {
  const query: QueryMock = jest.fn(async (sql: string) => {
    const handler = handlers.find((h) => h.match.test(sql));
    return handler ? handler.result : [];
  });

  return { dataSource: { query } as unknown as DataSource, query };
};

const createStripeMock = () => ({
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn()
  },
  accounts: {
    create: jest.fn(),
    retrieve: jest.fn(),
    createLoginLink: jest.fn()
  },
  accountLinks: { create: jest.fn() },
  refunds: { create: jest.fn() },
  webhooks: { constructEvent: jest.fn() }
});

describe('PaymentsService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  describe('prototype mode (no Stripe keys)', () => {
    it('creates a prototype intent without calling Stripe', async () => {
      const { dataSource, query } = createDataSource([{ match: /FROM bookings b/, result: [bookingRow()] }]);
      const service = new PaymentsService(dataSource, null);

      const result = await service.createPaymentIntentForBooking(DRIVER, 'booking-1');

      expect(result.mode).toBe('prototype');
      expect(result.clientSecret).toBeNull();
      expect(result.amountCents).toBe(12050);
      expect(result.paymentIntentId).toMatch(/^pi_proto_/);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('SET payment_intent_id'), [
        result.paymentIntentId,
        'booking-1'
      ]);
    });

    it('confirms payment without Stripe verification', async () => {
      const { dataSource, query } = createDataSource([
        { match: /FROM bookings b/, result: [bookingRow({ payment_intent_id: 'pi_proto_1' })] },
        { match: /SET status = 'paid_confirmed'/, result: [[{ id: 'booking-1' }], 1] }
      ]);
      const service = new PaymentsService(dataSource, null);

      await service.confirmBookingPayment(DRIVER, 'booking-1', {});

      expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'accepted'"), ['pi_proto_1', 'booking-1']);
    });

    it('reports prototype config and connect status, and never refunds', async () => {
      const { dataSource } = createDataSource([]);
      const service = new PaymentsService(dataSource, null);

      expect(service.getConfig()).toEqual({ mode: 'prototype', publishableKey: null, currency: 'eur' });
      expect((await service.getConnectStatus(OWNER)).mode).toBe('prototype');
      expect(await service.refundBookingOnCancellation('booking-1', 'driver')).toBeNull();
      await expect(service.createConnectOnboardingLink(OWNER)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('stripe mode', () => {
    it('creates a destination charge with application fee when owner has an active Connect account', async () => {
      process.env.STRIPE_APPLICATION_FEE_PERCENT = '10';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_x';
      const stripe = createStripeMock();
      stripe.accounts.retrieve.mockResolvedValue({ id: 'acct_owner', capabilities: { transfers: 'active' } });
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        status: 'requires_payment_method',
        transfer_data: { destination: 'acct_owner' },
        application_fee_amount: 1205
      });
      const { dataSource } = createDataSource([
        { match: /FROM bookings b/, result: [bookingRow()] },
        { match: /SELECT stripe_account_id FROM users/, result: [{ stripe_account_id: 'acct_owner' }] }
      ]);
      const service = new PaymentsService(dataSource, stripe as unknown as Stripe);

      const result = await service.createPaymentIntentForBooking(DRIVER, 'booking-1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 12050,
          currency: 'eur',
          transfer_data: { destination: 'acct_owner' },
          application_fee_amount: 1205,
          metadata: expect.objectContaining({ bookingId: 'booking-1' })
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
      expect(result).toMatchObject({
        mode: 'stripe',
        clientSecret: 'pi_123_secret',
        publishableKey: 'pk_test_x',
        destinationAccountId: 'acct_owner',
        applicationFeeCents: 1205
      });
    });

    it('falls back to a platform charge when owner is not onboarded', async () => {
      const stripe = createStripeMock();
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_456', client_secret: 's', status: 'requires_payment_method' });
      const { dataSource } = createDataSource([
        { match: /FROM bookings b/, result: [bookingRow()] },
        { match: /SELECT stripe_account_id FROM users/, result: [{ stripe_account_id: null }] }
      ]);
      const service = new PaymentsService(dataSource, stripe as unknown as Stripe);

      await service.createPaymentIntentForBooking(DRIVER, 'booking-1');

      const params = stripe.paymentIntents.create.mock.calls[0][0];
      expect(params.transfer_data).toBeUndefined();
      expect(params.application_fee_amount).toBeUndefined();
    });

    it('reuses an existing non-cancelled intent', async () => {
      const stripe = createStripeMock();
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_old', client_secret: 'old', status: 'requires_payment_method' });
      const { dataSource } = createDataSource([
        { match: /FROM bookings b/, result: [bookingRow({ payment_intent_id: 'pi_old' })] }
      ]);
      const service = new PaymentsService(dataSource, stripe as unknown as Stripe);

      const result = await service.createPaymentIntentForBooking(DRIVER, 'booking-1');

      expect(result.paymentIntentId).toBe('pi_old');
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('rejects confirmation when the intent has not succeeded', async () => {
      const stripe = createStripeMock();
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method', metadata: {} });
      const { dataSource } = createDataSource([
        { match: /FROM bookings b/, result: [bookingRow({ payment_intent_id: 'pi_1' })] }
      ]);
      const service = new PaymentsService(dataSource, stripe as unknown as Stripe);

      await expect(service.confirmBookingPayment(DRIVER, 'booking-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates an Express account and onboarding link for a new owner', async () => {
      const stripe = createStripeMock();
      stripe.accounts.create.mockResolvedValue({ id: 'acct_new' });
      stripe.accountLinks.create.mockResolvedValue({ url: 'https://connect.stripe.com/setup/x', expires_at: 123 });
      const { dataSource, query } = createDataSource([
        { match: /SELECT stripe_account_id FROM users/, result: [{ stripe_account_id: null }] },
        { match: /SET stripe_account_id/, result: [[{ stripe_account_id: 'acct_new' }], 1] }
      ]);
      const service = new PaymentsService(dataSource, stripe as unknown as Stripe);

      const result = await service.createConnectOnboardingLink(OWNER);

      expect(stripe.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'express', country: 'ES', email: OWNER.email }),
        expect.anything()
      );
      expect(query).toHaveBeenCalledWith(expect.stringContaining('SET stripe_account_id'), ['acct_new', OWNER.sub]);
      expect(stripe.accountLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({ account: 'acct_new', type: 'account_onboarding' })
      );
      expect(result).toEqual({ accountId: 'acct_new', url: 'https://connect.stripe.com/setup/x', expiresAt: 123 });
    });

    describe('refundBookingOnCancellation', () => {
      const now = new Date('2030-01-01T10:00:00Z');

      const setup = (startIso: string) => {
        const stripe = createStripeMock();
        stripe.paymentIntents.retrieve.mockResolvedValue({
          id: 'pi_paid',
          status: 'succeeded',
          amount: 10000,
          amount_received: 10000,
          transfer_data: { destination: 'acct_owner' }
        });
        stripe.refunds.create.mockResolvedValue({ id: 're_1' });
        const { dataSource } = createDataSource([
          {
            match: /FROM bookings b/,
            result: [
              bookingRow({
                booking_status: 'paid_confirmed',
                payment_intent_id: 'pi_paid',
                start_datetime: new Date(startIso)
              })
            ]
          }
        ]);
        return { stripe, service: new PaymentsService(dataSource, stripe as unknown as Stripe) };
      };

      it('refunds 100% (reversing transfer and fee) when the driver cancels >= 48h before', async () => {
        const { stripe, service } = setup('2030-01-05T10:00:00Z');

        const result = await service.refundBookingOnCancellation('booking-1', 'driver', now);

        expect(result).toEqual({ refundId: 're_1', amountCents: 10000, percentage: 100 });
        expect(stripe.refunds.create).toHaveBeenCalledWith(
          expect.objectContaining({
            payment_intent: 'pi_paid',
            amount: 10000,
            reverse_transfer: true,
            refund_application_fee: true
          }),
          { idempotencyKey: 'booking-refund-booking-1' }
        );
      });

      it('refunds 50% between 24h and 48h', async () => {
        const { service } = setup('2030-01-02T20:00:00Z');
        expect(await service.refundBookingOnCancellation('booking-1', 'driver', now)).toMatchObject({
          amountCents: 5000,
          percentage: 50
        });
      });

      it('does not refund under 24h for driver cancellations', async () => {
        const { stripe, service } = setup('2030-01-01T20:00:00Z');
        expect(await service.refundBookingOnCancellation('booking-1', 'driver', now)).toBeNull();
        expect(stripe.refunds.create).not.toHaveBeenCalled();
      });

      it('always refunds 100% when the owner cancels', async () => {
        const { service } = setup('2030-01-01T20:00:00Z');
        expect(await service.refundBookingOnCancellation('booking-1', 'owner', now)).toMatchObject({ percentage: 100 });
      });
    });
  });
});
