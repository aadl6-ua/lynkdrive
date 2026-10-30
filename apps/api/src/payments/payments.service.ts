import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { AuthUser } from 'src/auth/auth-user.type';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { ConnectLinkResponseDto, ConnectStatusResponseDto } from './dto/connect-response.dto';
import { PaymentConfigResponseDto } from './dto/payment-config-response.dto';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';
import { PaymentStatusResponseDto } from './dto/payment-status-response.dto';
import { STRIPE_CLIENT } from './stripe-client.provider';

type BookingPaymentRow = {
  booking_id: string;
  booking_status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
  vehicle_id: string;
  owner_id: string;
  driver_id: string;
  total_price: string;
  start_datetime: Date | string;
  payment_intent_id: string | null;
  payout_status: 'pending' | 'processing' | 'paid' | 'failed';
};

export type RefundResult = {
  refundId: string;
  amountCents: number;
  percentage: number;
} | null;

const PROTOTYPE_INTENT_PREFIX = 'pi_proto_';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly currency = 'eur';

  constructor(
    private readonly dataSource: DataSource,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null
  ) {}

  isStripeMode(): boolean {
    return this.stripe !== null;
  }

  getConfig(): PaymentConfigResponseDto {
    return {
      mode: this.isStripeMode() ? 'stripe' : 'prototype',
      publishableKey: this.isStripeMode() ? process.env.STRIPE_PUBLISHABLE_KEY ?? null : null,
      currency: this.currency
    };
  }

  async getBookingPaymentStatus(user: AuthUser, bookingId: string): Promise<PaymentStatusResponseDto> {
    const booking = await this.getBookingPaymentRow(bookingId);
    this.ensureParticipant(booking, user.sub);

    return this.toPaymentStatus(booking);
  }

  async createPaymentIntentForBooking(user: AuthUser, bookingId: string): Promise<PaymentIntentResponseDto> {
    const booking = await this.getBookingPaymentRow(bookingId);
    this.ensureDriver(booking, user.sub);

    if (booking.booking_status !== 'accepted') {
      throw new BadRequestException('Payment intent can be created only for accepted bookings');
    }

    const amountCents = this.toCents(booking.total_price);

    if (this.stripe) {
      const stripe = this.stripe;
      const existingPaymentIntent = await this.findOrRetrieveExistingPaymentIntent(stripe, booking.payment_intent_id);

      if (existingPaymentIntent && existingPaymentIntent.status !== 'canceled') {
        return this.toIntentResponse(booking.booking_id, existingPaymentIntent, amountCents);
      }

      const destination = await this.getReadyConnectedAccountId(booking.owner_id);
      const params: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency: this.currency,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          bookingId: booking.booking_id,
          vehicleId: booking.vehicle_id,
          driverId: booking.driver_id,
          ownerId: booking.owner_id
        }
      };

      if (destination) {
        // Destination charge: el cobro se hace en la plataforma y se transfiere al propietario
        // descontando la comisión de plataforma (application fee).
        params.transfer_data = { destination };
        params.application_fee_amount = this.computeApplicationFeeCents(amountCents);
      } else {
        this.logger.warn(
          `Owner ${booking.owner_id} has no active Connect account; charging booking ${booking.booking_id} to platform only`
        );
      }

      const created = await stripe.paymentIntents.create(params, {
        idempotencyKey: `booking-intent-${booking.booking_id}-${booking.payment_intent_id ?? 'new'}`
      });

      await this.dataSource.query(
        `
          UPDATE bookings
          SET payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [created.id, booking.booking_id]
      );

      return this.toIntentResponse(booking.booking_id, created, amountCents);
    }

    const prototypeIntentId = booking.payment_intent_id ?? `${PROTOTYPE_INTENT_PREFIX}${Date.now()}`;

    if (!booking.payment_intent_id) {
      await this.dataSource.query(
        `
          UPDATE bookings
          SET payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [prototypeIntentId, booking.booking_id]
      );
    }

    return {
      bookingId: booking.booking_id,
      paymentIntentId: prototypeIntentId,
      clientSecret: null,
      amountCents,
      currency: this.currency,
      mode: 'prototype',
      publishableKey: null,
      destinationAccountId: null,
      applicationFeeCents: null
    };
  }

  async confirmBookingPayment(
    user: AuthUser,
    bookingId: string,
    confirmDto: ConfirmPaymentDto
  ): Promise<PaymentStatusResponseDto> {
    const booking = await this.getBookingPaymentRow(bookingId);
    this.ensureDriver(booking, user.sub);

    if (booking.booking_status === 'paid_confirmed') {
      return this.toPaymentStatus(booking);
    }

    if (booking.booking_status !== 'accepted') {
      throw new BadRequestException('Payment can be confirmed only from accepted status');
    }

    const paymentIntentId = confirmDto.paymentIntentId ?? booking.payment_intent_id;

    if (!paymentIntentId) {
      throw new BadRequestException('paymentIntentId is required to confirm payment');
    }

    if (this.stripe) {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      if (intent.status !== 'succeeded') {
        throw new BadRequestException(
          `Payment intent must be succeeded before confirmation. Current status: ${intent.status}`
        );
      }

      if (intent.metadata?.bookingId && intent.metadata.bookingId !== booking.booking_id) {
        throw new BadRequestException('Payment intent does not belong to this booking');
      }
    }

    await this.markBookingPaid(booking.booking_id, paymentIntentId);

    const updated = await this.getBookingPaymentRow(booking.booking_id);
    return this.toPaymentStatus(updated);
  }

  // ---------------------------------------------------------------------------
  // Stripe Connect (onboarding de propietarios)
  // ---------------------------------------------------------------------------

  async getConnectStatus(user: AuthUser): Promise<ConnectStatusResponseDto> {
    if (!this.stripe) {
      return {
        mode: 'prototype',
        accountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        transfersActive: false
      };
    }

    const accountId = await this.getUserStripeAccountId(user.sub);

    if (!accountId) {
      return {
        mode: 'stripe',
        accountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        transfersActive: false
      };
    }

    const account = await this.stripe.accounts.retrieve(accountId);

    return {
      mode: 'stripe',
      accountId,
      detailsSubmitted: !!account.details_submitted,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      transfersActive: account.capabilities?.transfers === 'active'
    };
  }

  async createConnectOnboardingLink(user: AuthUser): Promise<ConnectLinkResponseDto> {
    const stripe = this.requireStripe();
    let accountId = await this.getUserStripeAccountId(user.sub);

    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: 'express',
          country: process.env.STRIPE_CONNECT_COUNTRY ?? 'ES',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true }
          },
          metadata: { userId: user.sub }
        },
        { idempotencyKey: `connect-account-${user.sub}` }
      );

      const rows = await this.dataSource.query(
        `
          UPDATE users
          SET stripe_account_id = $1
          WHERE id = $2 AND stripe_account_id IS NULL
          RETURNING stripe_account_id
        `,
        [account.id, user.sub]
      );

      // Si otra petición concurrente ya guardó una cuenta, se reutiliza la persistida.
      const saved = this.firstRow<{ stripe_account_id: string }>(rows)?.stripe_account_id;
      accountId = saved ?? (await this.getUserStripeAccountId(user.sub)) ?? account.id;
    }

    const apiPublicUrl = (process.env.API_PUBLIC_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: process.env.STRIPE_CONNECT_REFRESH_URL ?? `${apiPublicUrl}/payments/connect/refresh`,
      return_url: process.env.STRIPE_CONNECT_RETURN_URL ?? `${apiPublicUrl}/payments/connect/return`
    });

    return { accountId, url: link.url, expiresAt: link.expires_at };
  }

  async createConnectDashboardLink(user: AuthUser): Promise<ConnectLinkResponseDto> {
    const stripe = this.requireStripe();
    const accountId = await this.getUserStripeAccountId(user.sub);

    if (!accountId) {
      throw new BadRequestException('User has no Stripe Connect account yet');
    }

    const link = await stripe.accounts.createLoginLink(accountId);
    return { accountId, url: link.url, expiresAt: null };
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true; handled: boolean }> {
    const stripe = this.stripe;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhooks are not configured');
    }

    if (!rawBody || !signature) {
      throw new BadRequestException('Missing raw body or Stripe-Signature header');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      throw new BadRequestException(`Invalid Stripe signature: ${(error as Error).message}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        return { received: true, handled: await this.onPaymentIntentSucceeded(event.data.object) };
      case 'payment_intent.payment_failed':
        this.logger.warn(`Payment failed for intent ${event.data.object.id}`);
        return { received: true, handled: true };
      case 'account.updated':
        // El estado de la cuenta Connect se consulta en vivo en /payments/connect/status.
        this.logger.log(`Connect account updated: ${event.data.object.id}`);
        return { received: true, handled: true };
      default:
        return { received: true, handled: false };
    }
  }

  private async onPaymentIntentSucceeded(intent: Stripe.PaymentIntent): Promise<boolean> {
    let bookingId: string | null = intent.metadata?.bookingId ?? null;

    if (!bookingId) {
      const rows = await this.dataSource.query(`SELECT id FROM bookings WHERE payment_intent_id = $1 LIMIT 1`, [
        intent.id
      ]);
      bookingId = this.firstRow<{ id: string }>(rows)?.id ?? null;
    }

    if (!bookingId) {
      this.logger.warn(`payment_intent.succeeded ${intent.id} without matching booking`);
      return false;
    }

    const updated = await this.markBookingPaid(bookingId, intent.id);

    if (!updated) {
      const current = await this.dataSource.query(`SELECT status FROM bookings WHERE id = $1`, [bookingId]);
      const status = this.firstRow<{ status: string }>(current)?.status;

      if (status !== 'paid_confirmed') {
        this.logger.warn(`Booking ${bookingId} is in status ${status ?? 'unknown'}; payment ${intent.id} not applied`);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Reembolsos
  // ---------------------------------------------------------------------------

  /**
   * Reembolsa el cobro de una reserva `paid_confirmed` que se cancela.
   * - Cancelación del propietario: 100%.
   * - Cancelación del conductor: política Demo 1 (>=48h 100%, 24-48h 50%, <24h 0%).
   * En modo prototipo (o con intent de prototipo) no hace nada.
   */
  async refundBookingOnCancellation(
    bookingId: string,
    cancelledBy: 'owner' | 'driver',
    now: Date = new Date()
  ): Promise<RefundResult> {
    if (!this.stripe) {
      return null;
    }

    const booking = await this.getBookingPaymentRow(bookingId);

    if (booking.booking_status !== 'paid_confirmed') {
      return null;
    }

    const paymentIntentId = booking.payment_intent_id;

    if (!paymentIntentId || paymentIntentId.startsWith(PROTOTYPE_INTENT_PREFIX)) {
      return null;
    }

    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== 'succeeded') {
      return null;
    }

    const percentage =
      cancelledBy === 'owner' ? 100 : this.refundPercentageForDriver(new Date(booking.start_datetime), now);

    if (percentage === 0) {
      return null;
    }

    const amountCents = Math.round((intent.amount_received || intent.amount) * (percentage / 100));
    const isDestinationCharge = !!intent.transfer_data?.destination;

    const refund = await this.stripe.refunds.create(
      {
        payment_intent: intent.id,
        amount: amountCents,
        reverse_transfer: isDestinationCharge || undefined,
        refund_application_fee: isDestinationCharge || undefined,
        metadata: { bookingId, cancelledBy, percentage: String(percentage) }
      },
      { idempotencyKey: `booking-refund-${bookingId}` }
    );

    return { refundId: refund.id, amountCents, percentage };
  }

  refundPercentageForDriver(startDatetime: Date, now: Date): number {
    const hoursUntilStart = (startDatetime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilStart >= 48) {
      return 100;
    }

    if (hoursUntilStart >= 24) {
      return 50;
    }

    return 0;
  }

  computeApplicationFeeCents(amountCents: number): number {
    const raw = Number(process.env.STRIPE_APPLICATION_FEE_PERCENT ?? '10');
    const percent = Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 10;
    return Math.round(amountCents * (percent / 100));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Mueve la reserva a `paid_confirmed` solo si sigue en `accepted` (idempotente).
   * Devuelve true si se aplicó el cambio.
   */
  private async markBookingPaid(bookingId: string, paymentIntentId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
        UPDATE bookings
        SET status = 'paid_confirmed', payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND status = 'accepted'
        RETURNING id
      `,
      [paymentIntentId, bookingId]
    );

    return !!this.firstRow<{ id: string }>(rows);
  }

  private async getReadyConnectedAccountId(ownerId: string): Promise<string | null> {
    if (!this.stripe) {
      return null;
    }

    const accountId = await this.getUserStripeAccountId(ownerId);

    if (!accountId) {
      return null;
    }

    try {
      const account = await this.stripe.accounts.retrieve(accountId);
      return account.capabilities?.transfers === 'active' ? accountId : null;
    } catch (error) {
      this.logger.warn(`Could not retrieve Connect account ${accountId}: ${(error as Error).message}`);
      return null;
    }
  }

  private async getUserStripeAccountId(userId: string): Promise<string | null> {
    const rows = await this.dataSource.query(`SELECT stripe_account_id FROM users WHERE id = $1 LIMIT 1`, [userId]);
    return this.firstRow<{ stripe_account_id: string | null }>(rows)?.stripe_account_id ?? null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured (prototype mode)');
    }

    return this.stripe;
  }

  private firstRow<T>(rows: unknown): T | undefined {
    // pg devuelve filas en arrays; para UPDATE ... RETURNING TypeORM devuelve [rows, count].
    if (!Array.isArray(rows)) {
      return undefined;
    }

    if (Array.isArray(rows[0])) {
      return rows[0][0] as T | undefined;
    }

    return rows[0] as T | undefined;
  }

  private async getBookingPaymentRow(bookingId: string): Promise<BookingPaymentRow> {
    const rows = await this.dataSource.query(
      `
        SELECT
          b.id AS booking_id,
          b.status AS booking_status,
          b.vehicle_id,
          v.owner_id,
          b.driver_id,
          b.total_price,
          b.start_datetime,
          b.payment_intent_id,
          b.payout_status
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId]
    );

    const booking = (rows[0] as BookingPaymentRow | undefined) ?? null;

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    return booking;
  }

  private ensureParticipant(booking: BookingPaymentRow, userId: string): void {
    if (booking.owner_id !== userId && booking.driver_id !== userId) {
      throw new ForbiddenException('You do not have access to this booking payment');
    }
  }

  private ensureDriver(booking: BookingPaymentRow, userId: string): void {
    if (booking.driver_id !== userId) {
      throw new ForbiddenException('Only the booking driver can perform payment actions');
    }
  }

  private toCents(totalPrice: string): number {
    const amount = Number(totalPrice);

    if (Number.isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Booking total price is invalid for payment');
    }

    return Math.round(amount * 100);
  }

  private toPaymentStatus(row: BookingPaymentRow): PaymentStatusResponseDto {
    return {
      bookingId: row.booking_id,
      bookingStatus: row.booking_status,
      paymentIntentId: row.payment_intent_id,
      payoutStatus: row.payout_status,
      totalPrice: Number(row.total_price),
      currency: this.currency
    };
  }

  private toIntentResponse(bookingId: string, intent: Stripe.PaymentIntent, amountCents: number): PaymentIntentResponseDto {
    const destination = intent.transfer_data?.destination;

    return {
      bookingId,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amountCents,
      currency: this.currency,
      mode: 'stripe',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      destinationAccountId: typeof destination === 'string' ? destination : destination?.id ?? null,
      applicationFeeCents: intent.application_fee_amount ?? null
    };
  }

  private async findOrRetrieveExistingPaymentIntent(
    stripe: Stripe,
    paymentIntentId: string | null
  ): Promise<Stripe.PaymentIntent | null> {
    if (!paymentIntentId || paymentIntentId.startsWith(PROTOTYPE_INTENT_PREFIX)) {
      return null;
    }

    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return null;
    }
  }
}
