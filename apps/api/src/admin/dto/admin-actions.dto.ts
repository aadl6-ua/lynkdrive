import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetVerificationDto {
  @IsBoolean()
  isVerified!: boolean;
}

export class SetBlockedDto {
  @IsBoolean()
  blocked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetVehicleStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}

export class SetReviewVisibilityDto {
  @IsBoolean()
  hidden!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
