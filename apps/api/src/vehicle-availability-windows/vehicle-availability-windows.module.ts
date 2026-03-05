import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { VehicleAvailabilityWindowEntity } from './entities/vehicle-availability-window.entity';
import { VehicleAvailabilityWindowsController } from './vehicle-availability-windows.controller';
import { VehicleAvailabilityWindowsService } from './vehicle-availability-windows.service';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleAvailabilityWindowEntity, VehicleEntity])],
  controllers: [VehicleAvailabilityWindowsController],
  providers: [VehicleAvailabilityWindowsService],
  exports: [VehicleAvailabilityWindowsService]
})
export class VehicleAvailabilityWindowsModule {}
