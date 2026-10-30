import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { BookingChecklistsService } from './booking-checklists.service';
import { CreateBookingChecklistDto } from './dto/create-booking-checklist.dto';
import { UpdateBookingChecklistDto } from './dto/update-booking-checklist.dto';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('booking-checklists')
export class BookingChecklistsController {
  constructor(private readonly bookingChecklistsService: BookingChecklistsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query('bookingId', new ParseUUIDPipe({ optional: true })) bookingId?: string) {
    return this.bookingChecklistsService.findAllForUser(user.sub, bookingId ?? '');
  }

  @Get(':id')
  async findById(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookingChecklistsService.findByIdForUser(id, user.sub);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() createBookingChecklistDto: CreateBookingChecklistDto
  ) {
    return this.bookingChecklistsService.createForUser(user.sub, createBookingChecklistDto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateBookingChecklistDto: UpdateBookingChecklistDto
  ) {
    return this.bookingChecklistsService.updateForUser(id, user.sub, updateBookingChecklistDto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.bookingChecklistsService.deleteForUser(id, user.sub);
  }
}
