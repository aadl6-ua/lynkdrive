import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateReviewRequest } from '@lynkdrive/shared';

export class UpdateReviewDto implements UpdateReviewRequest {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}
