import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export type ChecklistType = 'check_in' | 'check_out';

export class CreateBookingChecklistDto {
  @IsUUID()
  bookingId!: string;

  @IsIn(['check_in', 'check_out'])
  type!: ChecklistType;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  mileage!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  fuelLevel!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
