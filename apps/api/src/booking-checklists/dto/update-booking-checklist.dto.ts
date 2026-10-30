import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateBookingChecklistDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  fuelLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}
