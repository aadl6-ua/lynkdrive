import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('mine/as-driver')
  async findMineAsDriver(@CurrentUser() user: AuthUser) {
    return this.bookingsService.findMineAsDriver(user.sub);
  }

  @Get('mine/as-owner')
  async findMineAsOwner(@CurrentUser() user: AuthUser) {
    return this.bookingsService.findMineAsOwner(user.sub);
  }

  @Get('vehicle/:vehicleId')
  async findByVehicle(@Param('vehicleId', new ParseUUIDPipe()) vehicleId: string) {
    return this.bookingsService.findByVehicleId(vehicleId);
  }

  @Get(':id')
  async findById(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookingsService.findByIdForUser(id, user.sub);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.createForDriver(user.sub, createBookingDto);
  }

  @Put(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateStatusDto: UpdateBookingStatusDto
  ) {
    return this.bookingsService.updateStatus(id, user, updateStatusDto);
  }
}
