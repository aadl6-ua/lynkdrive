import { Body, Controller, Get, HttpCode, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { BookingMessagesService } from './booking-messages.service';
import { CreateBookingMessageDto, ListBookingMessagesQueryDto, MarkBookingMessagesReadDto } from './dto/booking-message.dto';

// El pipe global no transforma: para los query params (limit) se convierte aquí.
const QueryPipe = new ValidationPipe({ transform: true, whitelist: true });

@UseGuards(SupabaseJwtAuthGuard)
@Controller('booking-messages')
export class BookingMessagesController {
  constructor(private readonly bookingMessagesService: BookingMessagesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query(QueryPipe) query: ListBookingMessagesQueryDto) {
    return this.bookingMessagesService.list(user.sub, query);
  }

  @Get('unread')
  async unread(@CurrentUser() user: AuthUser) {
    return this.bookingMessagesService.unread(user.sub);
  }

  // Límite propio por encima del global: evita spam sin molestar a una conversación normal.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingMessageDto) {
    return this.bookingMessagesService.create(user.sub, dto);
  }

  @Post('read')
  @HttpCode(200)
  async markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkBookingMessagesReadDto) {
    return this.bookingMessagesService.markRead(user.sub, dto.bookingId);
  }
}
