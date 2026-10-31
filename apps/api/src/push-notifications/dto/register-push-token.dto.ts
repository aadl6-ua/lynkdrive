import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(255)
  @Matches(EXPO_PUSH_TOKEN_PATTERN, { message: 'token must be an Expo push token' })
  token!: string;

  @IsIn(PUSH_PLATFORMS)
  platform!: PushPlatform;
}
