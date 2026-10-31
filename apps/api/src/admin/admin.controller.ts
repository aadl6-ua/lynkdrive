import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { AdminService } from './admin.service';
import { SetBlockedDto, SetReviewVisibilityDto, SetVehicleStatusDto, SetVerificationDto } from './dto/admin-actions.dto';
import {
  AdminBookingsQueryDto,
  AdminIncidentsQueryDto,
  AdminReviewsQueryDto,
  AdminUsersQueryDto,
  AdminVehiclesQueryDto
} from './dto/admin-query.dto';
import { CreateIncidentDto, CreateIncidentNoteDto, UpdateIncidentStatusDto } from './dto/incident.dto';

// El pipe global no transforma: para los query params (page, pageSize...) se convierte aquí.
const QueryPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.adminService.getUser(user.sub);
  }

  @Get('dashboard')
  async dashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  async listUsers(@Query(QueryPipe) query: AdminUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  async getUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.getUser(id);
  }

  @Put('users/:id/verification')
  async setVerification(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetVerificationDto) {
    return this.adminService.setVerification(id, dto.isVerified);
  }

  @Put('users/:id/block')
  async setBlocked(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetBlockedDto
  ) {
    return this.adminService.setBlocked(user.sub, id, dto);
  }

  @Get('vehicles')
  async listVehicles(@Query(QueryPipe) query: AdminVehiclesQueryDto) {
    return this.adminService.listVehicles(query);
  }

  @Put('vehicles/:id/status')
  async setVehicleStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetVehicleStatusDto) {
    return this.adminService.setVehicleStatus(id, dto.status);
  }

  @Get('reviews')
  async listReviews(@Query(QueryPipe) query: AdminReviewsQueryDto) {
    return this.adminService.listReviews(query);
  }

  @Put('reviews/:id/visibility')
  async setReviewVisibility(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetReviewVisibilityDto) {
    return this.adminService.setReviewVisibility(id, dto);
  }

  @Get('bookings')
  async listBookings(@Query(QueryPipe) query: AdminBookingsQueryDto) {
    return this.adminService.listBookings(query);
  }

  @Get('bookings/:id')
  async getBooking(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.getBooking(id);
  }

  @Get('incidents')
  async listIncidents(@Query(QueryPipe) query: AdminIncidentsQueryDto) {
    return this.adminService.listIncidents(query);
  }

  @Post('incidents')
  async createIncident(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.adminService.createIncident(user.sub, dto);
  }

  @Get('incidents/:id')
  async getIncident(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.getIncident(id);
  }

  @Put('incidents/:id/status')
  async setIncidentStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateIncidentStatusDto) {
    return this.adminService.setIncidentStatus(id, dto.status);
  }

  @Post('incidents/:id/notes')
  async addIncidentNote(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateIncidentNoteDto
  ) {
    return this.adminService.addIncidentNote(user.sub, id, dto.body);
  }
}
