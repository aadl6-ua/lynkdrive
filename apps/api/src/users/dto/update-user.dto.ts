import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateMyProfileRequest } from '@lynkdrive/shared';

export class UpdateUserDto implements UpdateMyProfileRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idDocumentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  driverLicenseUrl?: string | null;
}
