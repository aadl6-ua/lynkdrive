import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVehicleAvailabilityWindowDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(64)
  startDatetime!: string;

  @IsString()
  @MaxLength(64)
  endDatetime!: string;
}
