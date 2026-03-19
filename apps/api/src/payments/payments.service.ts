import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { AuthUser } from 'src/auth/auth-user.type';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';
import { PaymentStatusResponseDto } from './dto/payment-status-response.dto';

type BookingPaymentRow = {
  booking_id: string;
  booking_status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
  vehicle_id: string;
  owner_id: string;
  driver_id: string;
  total_price: string;
  payment_intent_id: string | null;
  payout_status: 'pending' | 'processing' | 'paid' | 'failed';
};

@Injectable()
export class PaymentsService {
  private readonly stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  private readonly currency = 'eur';

  constructor(private readonly dataSource: DataSource) {}

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

    if (this.stripeSecretKey) {
      const stripe = new Stripe(this.stripeSecretKey);

      const existingPaymentIntent = await this.findOrRetrieveExistingPaymentIntent(stripe, booking.payment_intent_id);

      if (existingPaymentIntent) {
        return {
          bookingId: booking.booking_id,
          paymentIntentId: existingPaymentIntent.id,
          clientSecret: existingPaymentIntent.client_secret,
          amountCents,
          currency: this.currency,
          mode: 'stripe'
        };
      }

      const created = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: this.currency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          bookingId: booking.booking_id,
          vehicleId: booking.vehicle_id,
          driverId: booking.driver_id,
          ownerId: booking.owner_id
        }
      });

      await this.dataSource.query(
        `
          UPDATE bookings
          SET payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [created.id, booking.booking_id]
      );

      return {
        bookingId: booking.booking_id,
        paymentIntentId: created.id,
        clientSecret: created.client_secret,
        amountCents,
        currency: this.currency,
        mode: 'stripe'
      };
    }

    const prototypeIntentId = booking.payment_intent_id ?? `pi_proto_${Date.now()}`;

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
      mode: 'prototype'
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

    if (this.stripeSecretKey) {
      const stripe = new Stripe(this.stripeSecretKey);
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (intent.status !== 'succeeded') {
        throw new BadRequestException(
          `Payment intent must be succeeded before confirmation. Current status: ${intent.status}`
        );
      }
    }

    await this.dataSource.query(
      `
        UPDATE bookings
        SET status = 'paid_confirmed', payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [paymentIntentId, booking.booking_id]
    );

    const updated = await this.getBookingPaymentRow(booking.booking_id);
    return this.toPaymentStatus(updated);
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

  private async findOrRetrieveExistingPaymentIntent(
    stripe: Stripe,
    paymentIntentId: string | null
  ): Promise<Stripe.Response<Stripe.PaymentIntent> | null> {
    if (!paymentIntentId) {
      return null;
    }

    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return null;
    }
  }
}
