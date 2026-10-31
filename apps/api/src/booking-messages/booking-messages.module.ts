import { Module } from '@nestjs/common';
import { BookingMessagesController } from './booking-messages.controller';
import { BookingMessagesService } from './booking-messages.service';

@Module({
  controllers: [BookingMessagesController],
  providers: [BookingMessagesService],
  exports: [BookingMessagesService]
})
export class BookingMessagesModule {}
