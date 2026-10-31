import { useEffect } from 'react';
import { usePushNotificationsStore } from '../../store/usePushNotificationsStore';
import { registerForPushNotifications, subscribeToNotificationTaps } from './pushNotifications';

/**
 * Con sesión: registra el token si el permiso ya estaba concedido (sin diálogos; el permiso
 * se pide desde Perfil) y, al tocar una notificación de reserva, abre Mis Viajes en ella
 * (en su conversación si es un mensaje del chat).
 */
export function usePushNotifications(userId: string | null, onOpenTrips: () => void): void {
  const openBooking = usePushNotificationsStore((state) => state.openBooking);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void registerForPushNotifications({ askPermission: false });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    return subscribeToNotificationTaps((bookingId, openMessages) => {
      openBooking(bookingId, openMessages);
      onOpenTrips();
    });
  }, [userId, openBooking, onOpenTrips]);
}
