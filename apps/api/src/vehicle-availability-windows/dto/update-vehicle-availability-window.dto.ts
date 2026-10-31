import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVehicleAvailabilityWindowDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  startDatetime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  endDatetime?: string;
}
