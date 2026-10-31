import { Global, Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushTokensController } from './push-tokens.controller';

// Global para que reservas y pagos puedan notificar sin dependencias circulares entre módulos.
@Global()
@Module({
  controllers: [PushTokensController],
  providers: [PushNotificationsService],
  exports: [PushNotificationsService]
})
export class PushNotificationsModule {}
