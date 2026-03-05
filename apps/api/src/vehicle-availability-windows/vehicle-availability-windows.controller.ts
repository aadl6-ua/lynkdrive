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
  Query
} from '@nestjs/common';
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

  @Post()
  async create(@Body() createVehicleAvailabilityWindowDto: CreateVehicleAvailabilityWindowDto) {
    return this.vehicleAvailabilityWindowsService.create(createVehicleAvailabilityWindowDto);
  }

  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVehicleAvailabilityWindowDto: UpdateVehicleAvailabilityWindowDto
  ) {
    return this.vehicleAvailabilityWindowsService.update(id, updateVehicleAvailabilityWindowDto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.vehicleAvailabilityWindowsService.delete(id);
  }
}
