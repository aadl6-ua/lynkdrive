import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateVehicleImageRequest } from '@lynkdrive/shared';

export class UpdateVehicleImageDto implements UpdateVehicleImageRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
