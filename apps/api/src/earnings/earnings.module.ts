import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { PaymentsModule } from '../payments/payments.module';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

@Module({
  imports: [TypeOrmModule.forFeature([BookingEntity]), PaymentsModule],
  controllers: [EarningsController],
  providers: [EarningsService]
})
export class EarningsModule {}
