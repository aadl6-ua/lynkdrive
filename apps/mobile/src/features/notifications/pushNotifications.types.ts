export type PushPermissionState = 'unsupported' | 'undetermined' | 'denied' | 'granted';

export type PushRegistrationResult =
  | { status: 'registered' }
  | { status: 'denied' | 'unsupported' | 'failed'; message: string };
