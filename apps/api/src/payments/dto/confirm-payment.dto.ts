import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentIntentId?: string;
}
