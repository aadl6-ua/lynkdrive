import { IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReviewDto {
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
