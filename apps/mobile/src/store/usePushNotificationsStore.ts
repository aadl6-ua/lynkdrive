import { create } from 'zustand';

type PushNotificationsState = {
  /** Reserva a abrir en Mis Viajes tras tocar una notificación. */
  pendingBookingId: string | null;
  openBooking: (bookingId: string) => void;
  consumePendingBooking: () => string | null;
};

export const usePushNotificationsStore = create<PushNotificationsState>((set, get) => ({
  pendingBookingId: null,
  openBooking: (bookingId) => set({ pendingBookingId: bookingId }),
  consumePendingBooking: () => {
    const bookingId = get().pendingBookingId;
    set({ pendingBookingId: null });
    return bookingId;
  }
}));
