import {
  BadRequestException,
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

const MAX_RADIUS_KM = 500;
const FUEL_TYPES = ['gasoline', 'diesel', 'electric', 'hybrid'] as const;
const TRANSMISSIONS = ['manual', 'automatic'] as const;

function parseOptionalEnum<T extends string>(value: string | undefined, allowed: readonly T[], field: string): T | undefined {
  if (!value) {
    return undefined;
  }

  if (!allowed.includes(value as T)) {
    throw new BadRequestException(`${field} debe ser uno de: ${allowed.join(', ')}`);
  }

  return value as T;
}

/** Rango de fechas del alquiler: ambas o ninguna, ISO válidas y `from` anterior a `to`. */
function parseOptionalRange(from?: string, to?: string): { from?: string; to?: string } {
  if (!from && !to) {
    return {};
  }

  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new BadRequestException('from y to deben ser fechas válidas y from anterior a to');
  }

  return { from: start.toISOString(), to: end.toISOString() };
}

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async findAll(@Query() query: Record<string, string | undefined>) {
    const lat = parseOptionalNumber(query.lat);
    const lng = parseOptionalNumber(query.lng);
    const radiusKm = parseOptionalNumber(query.radiusKm);

    // Valores fuera de rango o de los enums: 400 en lugar de un error de BD.
    if (
      (lat !== undefined && Math.abs(lat) > 90) ||
      (lng !== undefined && Math.abs(lng) > 180) ||
      (radiusKm !== undefined && (radiusKm <= 0 || radiusKm > MAX_RADIUS_KM))
    ) {
      throw new BadRequestException(`lat/lng fuera de rango o radiusKm no está entre 0 y ${MAX_RADIUS_KM}`);
    }

    const filters: GetVehiclesFiltersDto = {
      maxPrice: parseOptionalNumber(query.maxPrice),
      fuelType: parseOptionalEnum(query.fuelType, FUEL_TYPES, 'fuelType'),
      transmission: parseOptionalEnum(query.transmission, TRANSMISSIONS, 'transmission'),
      seats: parseOptionalNumber(query.seats),
      lat,
      lng,
      radiusKm,
      ...parseOptionalRange(query.from, query.to)
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
    return this.vehiclesService.findPublicById(id);
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
