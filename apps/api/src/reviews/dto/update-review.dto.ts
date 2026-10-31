import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}
