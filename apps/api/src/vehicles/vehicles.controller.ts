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
  Put
} from '@nestjs/common';
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

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vehiclesService.findById(id);
  }

  @Post()
  async create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
  }

  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVehicleDto: UpdateVehicleDto
  ) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @HttpCode(204)
  async softDelete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.vehiclesService.softDelete(id);
  }
}
