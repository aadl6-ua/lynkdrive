import type { PaymentConfigResponse, PaymentMode } from '@lynkdrive/shared';

export class PaymentConfigResponseDto implements PaymentConfigResponse {
  mode!: PaymentMode;
  publishableKey!: string | null;
  currency!: string;
}
