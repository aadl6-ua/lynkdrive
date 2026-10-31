import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from '../payments/payments.module';
import { UserEntity } from '../users/entities/user.entity';
import { VehicleAvailabilityWindowEntity } from '../vehicle-availability-windows/entities/vehicle-availability-window.entity';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingEntity } from './entities/booking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, VehicleEntity, UserEntity, VehicleAvailabilityWindowEntity]),
    PaymentsModule
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService]
})
export class BookingsModule {}
