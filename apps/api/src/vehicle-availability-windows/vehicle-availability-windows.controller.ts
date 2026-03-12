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
import { CreateVehicleAvailabilityWindowDto } from './dto/create-vehicle-availability-window.dto';
import { UpdateVehicleAvailabilityWindowDto } from './dto/update-vehicle-availability-window.dto';
import { VehicleAvailabilityWindowsService } from './vehicle-availability-windows.service';

@Controller('vehicle-availability-windows')
export class VehicleAvailabilityWindowsController {
  constructor(
    private readonly vehicleAvailabilityWindowsService: VehicleAvailabilityWindowsService
  ) {}

  @Get()
  async findAll(@Query('vehicleId') vehicleId?: string) {
    return this.vehicleAvailabilityWindowsService.findAll(vehicleId);
  }

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vehicleAvailabilityWindowsService.findById(id);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() createVehicleAvailabilityWindowDto: CreateVehicleAvailabilityWindowDto
  ) {
    return this.vehicleAvailabilityWindowsService.createForOwner(
      user.sub,
      createVehicleAvailabilityWindowDto
    );
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVehicleAvailabilityWindowDto: UpdateVehicleAvailabilityWindowDto
  ) {
    return this.vehicleAvailabilityWindowsService.updateForOwner(
      id,
      user.sub,
      updateVehicleAvailabilityWindowDto
    );
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  async softDelete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.vehicleAvailabilityWindowsService.softDeleteForOwner(id, user.sub);
  }
}
