import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
  UseGuards
} from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { GetVehiclesFiltersDto } from './dto/get-vehicles-filters.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

function parseOptionalNumber(value?: string): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value.trim().replace(',', '.'));

  return Number.isNaN(parsed) ? undefined : parsed;
}

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async findAll(@Query() query: Record<string, string | undefined>) {
    const filters: GetVehiclesFiltersDto = {
      maxPrice: parseOptionalNumber(query.maxPrice),
      fuelType: query.fuelType as GetVehiclesFiltersDto['fuelType'],
      transmission: query.transmission as GetVehiclesFiltersDto['transmission'],
      seats: parseOptionalNumber(query.seats),
      status: query.status as GetVehiclesFiltersDto['status'],
      lat: parseOptionalNumber(query.lat),
      lng: parseOptionalNumber(query.lng),
      radiusKm: parseOptionalNumber(query.radiusKm)
    };

    return this.vehiclesService.findAll(filters);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Get('mine/list')
  async findMine(@CurrentUser() user: AuthUser) {
    return this.vehiclesService.findMine(user.sub);
  }

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vehiclesService.findById(id);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.createForOwner(user.sub, createVehicleDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVehicleDto: UpdateVehicleDto
  ) {
    return this.vehiclesService.updateForOwner(id, user.sub, updateVehicleDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  async softDelete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.vehiclesService.softDeleteForOwner(id, user.sub);
  }
}
