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
import { CreateVehicleImageDto } from './dto/create-vehicle-image.dto';
import { UpdateVehicleImageDto } from './dto/update-vehicle-image.dto';
import { VehicleImagesService } from './vehicle-images.service';

@Controller('vehicle-images')
export class VehicleImagesController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Get()
  async findAll(@Query('vehicleId') vehicleId?: string) {
    return this.vehicleImagesService.findAll(vehicleId);
  }

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vehicleImagesService.findById(id);
  }

  @Post()
  async create(@Body() createVehicleImageDto: CreateVehicleImageDto) {
    return this.vehicleImagesService.create(createVehicleImageDto);
  }

  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVehicleImageDto: UpdateVehicleImageDto
  ) {
    return this.vehicleImagesService.update(id, updateVehicleImageDto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.vehicleImagesService.delete(id);
  }
}
