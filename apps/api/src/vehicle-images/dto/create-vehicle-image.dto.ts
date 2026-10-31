import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateVehicleImageRequest } from '@lynkdrive/shared';

export class CreateVehicleImageDto implements CreateVehicleImageRequest {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(255)
  imageUrl!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
