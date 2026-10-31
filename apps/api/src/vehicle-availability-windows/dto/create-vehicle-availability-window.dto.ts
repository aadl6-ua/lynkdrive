import { IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateVehicleAvailabilityWindowRequest } from '@lynkdrive/shared';

export class CreateVehicleAvailabilityWindowDto implements CreateVehicleAvailabilityWindowRequest {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(64)
  startDatetime!: string;

  @IsString()
  @MaxLength(64)
  endDatetime!: string;
}
