import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVehicleImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
