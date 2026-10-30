import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsUUID()
  id!: string;

  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

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
