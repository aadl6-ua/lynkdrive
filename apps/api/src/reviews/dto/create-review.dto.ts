import { IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateReviewRequest } from '@lynkdrive/shared';

export class CreateReviewDto implements CreateReviewRequest {
  @IsUUID()
  bookingId!: string;

  @IsUUID()
  revieweeId!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
