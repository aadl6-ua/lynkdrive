import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { ConfirmPaymentRequest } from '@lynkdrive/shared';

export class ConfirmPaymentDto implements ConfirmPaymentRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentIntentId?: string;
}
