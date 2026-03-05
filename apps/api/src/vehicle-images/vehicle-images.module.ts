import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { VehicleImageEntity } from './entities/vehicle-image.entity';
import { VehicleImagesController } from './vehicle-images.controller';
import { VehicleImagesService } from './vehicle-images.service';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleImageEntity, VehicleEntity])],
  controllers: [VehicleImagesController],
  providers: [VehicleImagesService],
  exports: [VehicleImagesService]
})
export class VehicleImagesModule {}
