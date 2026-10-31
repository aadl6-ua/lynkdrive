import type { PublicUserResponse, UserResponse } from '@lynkdrive/shared';

export class UserResponseDto implements UserResponse<Date> {
  id!: string;
  firstName!: string;
  lastName!: string;
  phoneNumber!: string | null;
  avatarUrl!: string | null;
  idDocumentUrl!: string | null;
  driverLicenseUrl!: string | null;
  isVerified!: boolean;
  createdAt!: Date;
}

export class PublicUserResponseDto implements PublicUserResponse<Date> {
  id!: string;
  firstName!: string;
  lastName!: string;
  avatarUrl!: string | null;
  isVerified!: boolean;
  createdAt!: Date;
}
