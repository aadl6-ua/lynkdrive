export class UserResponseDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  phoneNumber!: string | null;
  avatarUrl!: string | null;
  isVerified!: boolean;
  createdAt!: Date;
}
