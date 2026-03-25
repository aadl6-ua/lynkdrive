import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingChecklistEntity } from './entities/booking-checklist.entity';
import { BookingChecklistsController } from './booking-checklists.controller';
import { BookingChecklistsService } from './booking-checklists.service';

@Module({
  imports: [TypeOrmModule.forFeature([BookingChecklistEntity])],
  controllers: [BookingChecklistsController],
  providers: [BookingChecklistsService],
  exports: [BookingChecklistsService]
})
export class BookingChecklistsModule {}
