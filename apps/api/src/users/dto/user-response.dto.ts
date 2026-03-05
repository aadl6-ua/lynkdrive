export class UserResponseDto {
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
