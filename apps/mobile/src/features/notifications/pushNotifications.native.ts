import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { PushPermissionState, PushRegistrationResult } from './pushNotifications.types';
import { deletePushToken, registerPushToken } from './pushTokensApi';

type NotificationsModule = typeof import('expo-notifications');

const ANDROID_CHANNEL_ID = 'bookings';

let modulePromise: Promise<NotificationsModule | null> | null = null;
let registeredToken: string | null = null;

/**
 * Carga diferida de expo-notifications: en Expo Go de Android las push remotas no existen
 * desde SDK 53 y el resto de la app debe seguir funcionando sin ellas.
 */
function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return Promise.resolve(null);
  }

  modulePromise ??= import('expo-notifications')
    .then((notifications) => {
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false
        })
      });
      return notifications;
    })
    .catch(() => null);

  return modulePromise;
}

function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return process.env.EXPO_PUBLIC_EAS_PROJECT_ID || extra?.eas?.projectId || Constants.easConfig?.projectId || undefined;
}

async function isPhysicalDevice(): Promise<boolean> {
  try {
    const Device = await import('expo-device');
    return Device.isDevice;
  } catch {
    return false;
  }
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  const notifications = await loadNotifications();

  if (!notifications || !(await isPhysicalDevice()) || !getProjectId()) {
    return 'unsupported';
  }

  try {
    const permission = await notifications.getPermissionsAsync();

    if (permission.granted) {
      return 'granted';
    }

    return permission.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

async function getExpoPushToken(notifications: NotificationsModule): Promise<string> {
  const { data } = await notifications.getExpoPushTokenAsync({ projectId: getProjectId() });
  return data;
}

/**
 * Obtiene el token Expo y lo registra en la API. Con `askPermission: false` nunca muestra
 * el diálogo del sistema: solo registra si el permiso ya estaba concedido.
 */
export async function registerForPushNotifications({ askPermission }: { askPermission: boolean }): Promise<PushRegistrationResult> {
  const notifications = await loadNotifications();

  if (!notifications || !(await isPhysicalDevice()) || !getProjectId()) {
    return {
      status: 'unsupported',
      message: 'Las notificaciones requieren un dispositivo físico con una build de desarrollo o de EAS.'
    };
  }

  try {
    let permission = await notifications.getPermissionsAsync();

    if (!permission.granted && askPermission && permission.canAskAgain) {
      permission = await notifications.requestPermissionsAsync();
    }

    if (!permission.granted) {
      return {
        status: 'denied',
        message: permission.canAskAgain
          ? 'Activa las notificaciones para enterarte de tus reservas.'
          : 'Las notificaciones están desactivadas para LynkDrive en los ajustes del sistema.'
      };
    }

    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Reservas',
        importance: notifications.AndroidImportance.DEFAULT
      });
    }

    const token = await getExpoPushToken(notifications);
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
    return { status: 'registered' };
  } catch {
    return { status: 'failed', message: 'No se pudieron activar las notificaciones. Inténtalo más tarde.' };
  }
}

/** Da de baja el token del dispositivo (al cerrar sesión). Nunca lanza. */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    let token = registeredToken;

    if (!token) {
      const notifications = await loadNotifications();

      if (!notifications || !getProjectId() || !(await notifications.getPermissionsAsync()).granted) {
        return;
      }

      token = await getExpoPushToken(notifications);
    }

    await deletePushToken(token);
    registeredToken = null;
  } catch {
    // Sin red o sin sesión: el token se reasignará al próximo usuario o Expo lo invalidará.
  }
}

function bookingIdFrom(response: { notification: { request: { content: { data?: unknown } } } } | null): string | null {
  const data = response?.notification.request.content.data as { type?: string; bookingId?: unknown } | undefined;
  return data?.type === 'booking' && typeof data.bookingId === 'string' ? data.bookingId : null;
}

/** Avisa con el id de la reserva cuando el usuario toca una notificación (también si abrió la app con ella). */
export function subscribeToNotificationTaps(onBooking: (bookingId: string) => void): () => void {
  let active = true;
  let remove: (() => void) | null = null;

  void loadNotifications().then(async (notifications) => {
    if (!notifications || !active) {
      return;
    }

    const subscription = notifications.addNotificationResponseReceivedListener((response) => {
      const bookingId = bookingIdFrom(response);

      if (bookingId) {
        onBooking(bookingId);
      }
    });

    if (!active) {
      subscription.remove();
      return;
    }

    remove = () => subscription.remove();

    try {
      const initial = bookingIdFrom(await notifications.getLastNotificationResponseAsync());

      if (initial && active) {
        onBooking(initial);
        await notifications.clearLastNotificationResponseAsync();
      }
    } catch {
      // Sin notificación inicial.
    }
  });

  return () => {
    active = false;
    remove?.();
  };
}
