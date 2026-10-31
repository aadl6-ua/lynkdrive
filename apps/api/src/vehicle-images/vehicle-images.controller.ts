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
import { CreateVehicleImageDto } from './dto/create-vehicle-image.dto';
import { UpdateVehicleImageDto } from './dto/update-vehicle-image.dto';
import { VehicleImagesService } from './vehicle-images.service';

@Controller('vehicle-images')
export class VehicleImagesController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Get()
  async findAll(@Query('vehicleId', new ParseUUIDPipe({ optional: true })) vehicleId?: string) {
    return this.vehicleImagesService.findAll(vehicleId);
  }

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.vehicleImagesService.findById(id);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() createVehicleImageDto: CreateVehicleImageDto) {
    return this.vehicleImagesService.createForOwner(user.sub, createVehicleImageDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateVehicleImageDto: UpdateVehicleImageDto
  ) {
    return this.vehicleImagesService.updateForOwner(id, user.sub, updateVehicleImageDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  async softDelete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.vehicleImagesService.softDeleteForOwner(id, user.sub);
  }
}
