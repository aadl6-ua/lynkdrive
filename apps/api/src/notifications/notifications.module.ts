import { Global, Module } from '@nestjs/common';
import { BookingNotificationsService } from './booking-notifications.service';
import { MailerService } from './mailer.service';

// Global para que reservas y pagos puedan notificar sin dependencias circulares entre módulos.
@Global()
@Module({
  providers: [MailerService, BookingNotificationsService],
  exports: [MailerService, BookingNotificationsService]
})
export class NotificationsModule {}
