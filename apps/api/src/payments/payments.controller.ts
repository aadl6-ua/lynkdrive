import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('bookings/:bookingId')
  async getBookingPaymentStatus(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string
  ) {
    return this.paymentsService.getBookingPaymentStatus(user, bookingId);
  }

  @Post('bookings/:bookingId/intent')
  async createBookingPaymentIntent(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string
  ) {
    return this.paymentsService.createPaymentIntentForBooking(user, bookingId);
  }

  @Post('bookings/:bookingId/confirm')
  async confirmBookingPayment(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() confirmPaymentDto: ConfirmPaymentDto
  ) {
    return this.paymentsService.confirmBookingPayment(user, bookingId, confirmPaymentDto);
  }
}
