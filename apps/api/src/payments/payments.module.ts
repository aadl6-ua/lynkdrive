import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { stripeClientProvider } from './stripe-client.provider';

@Module({
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService, stripeClientProvider],
  exports: [PaymentsService]
})
export class PaymentsModule {}
