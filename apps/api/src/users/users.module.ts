import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { ReviewEntity } from '../reviews/entities/review.entity';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { AccountService } from './account.service';
import { UserEntity } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, BookingEntity, VehicleEntity, ReviewEntity])],
  controllers: [UsersController],
  providers: [UsersService, AccountService],
  exports: [UsersService]
})
export class UsersModule {}
