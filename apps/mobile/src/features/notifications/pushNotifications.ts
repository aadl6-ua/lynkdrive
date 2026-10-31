import { PushPermissionState, PushRegistrationResult } from './pushNotifications.types';

// Web: sin notificaciones push (la implementación real vive en pushNotifications.native.ts).

export async function getPushPermissionState(): Promise<PushPermissionState> {
  return 'unsupported';
}

export async function registerForPushNotifications(_options: { askPermission: boolean }): Promise<PushRegistrationResult> {
  return { status: 'unsupported', message: 'Las notificaciones solo están disponibles en la app de iOS y Android.' };
}

export async function unregisterPushNotifications(): Promise<void> {}

export function subscribeToNotificationTaps(_onBooking: (bookingId: string, openMessages: boolean) => void): () => void {
  return () => undefined;
}
