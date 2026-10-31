import { IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateBookingRequest } from '@lynkdrive/shared';

export class CreateBookingDto implements CreateBookingRequest {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(64)
  startDatetime!: string;

  @IsString()
  @MaxLength(64)
  endDatetime!: string;
}
