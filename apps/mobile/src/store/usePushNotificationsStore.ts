import { create } from 'zustand';

export type PendingBookingTarget = { bookingId: string; openMessages: boolean };

type PushNotificationsState = {
  /** Reserva a abrir en Mis Viajes tras tocar una notificación (y si hay que ir a sus mensajes). */
  pendingBooking: PendingBookingTarget | null;
  openBooking: (bookingId: string, openMessages?: boolean) => void;
  consumePendingBooking: () => PendingBookingTarget | null;
};

export const usePushNotificationsStore = create<PushNotificationsState>((set, get) => ({
  pendingBooking: null,
  openBooking: (bookingId, openMessages = false) => set({ pendingBooking: { bookingId, openMessages } }),
  consumePendingBooking: () => {
    const pending = get().pendingBooking;
    set({ pendingBooking: null });
    return pending;
  }
}));
