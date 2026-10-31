import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { ChecklistType, CreateBookingChecklistRequest } from '@lynkdrive/shared';

export type { ChecklistType };

export class CreateBookingChecklistDto implements CreateBookingChecklistRequest {
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
