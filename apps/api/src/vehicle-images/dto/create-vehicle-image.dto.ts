import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVehicleImageDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(255)
  imageUrl!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
