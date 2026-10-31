import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateVehicleAvailabilityWindowRequest } from '@lynkdrive/shared';

export class UpdateVehicleAvailabilityWindowDto implements UpdateVehicleAvailabilityWindowRequest {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  startDatetime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  endDatetime?: string;
}
