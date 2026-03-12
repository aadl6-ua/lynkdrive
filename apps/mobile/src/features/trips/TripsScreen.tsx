import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { styles } from '../../app/styles';
import { httpClient } from '../../api/http';
import { useAuthStore } from '../../store/useAuthStore';

type BookingItem = {
  id: string;
  vehicleId: string;
  ownerId: string;
  driverId: string;
  startDatetime: string;
  endDatetime: string;
  totalPrice: number;
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
};

export function TripsScreen() {
  const { userId: authUserId } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverBookings, setDriverBookings] = useState<BookingItem[]>([]);
  const [ownerBookings, setOwnerBookings] = useState<BookingItem[]>([]);

  const loadBookings = useCallback(async () => {
    if (!authUserId) {
      setDriverBookings([]);
      setOwnerBookings([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [driverResponse, ownerResponse] = await Promise.all([
        httpClient.get<BookingItem[]>('/bookings/mine/as-driver'),
        httpClient.get<BookingItem[]>('/bookings/mine/as-owner')
      ]);

      setDriverBookings(driverResponse.data);
      setOwnerBookings(ownerResponse.data);
    } catch {
      setError('No se pudieron cargar las reservas. Revisa token y backend.');
    } finally {
      setLoading(false);
    }
  }, [authUserId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  if (!authUserId) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.title}>Mis Viajes</Text>
        <Text style={styles.subtitle}>Inicia sesion para ver reservas como conductor y propietario.</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.title}>Mis Viajes</Text>
      <Text style={styles.subtitle}>Vista inicial de bookings para flujo conductor/propietario.</Text>

      <View style={styles.buttonContainer}>
        <Button title="Recargar reservas" onPress={() => void loadBookings()} />
      </View>

      {loading ? <ActivityIndicator size="small" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.switcherTitle}>Como conductor</Text>
        {driverBookings.map((booking) => (
          <Text key={booking.id} style={styles.row}>
            {booking.status} | {new Date(booking.startDatetime).toLocaleDateString('es-ES')} | {booking.totalPrice.toFixed(2)} EUR
          </Text>
        ))}
        {driverBookings.length === 0 ? (
          <Text style={styles.subtitle}>Sin reservas como conductor.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.switcherTitle}>Como propietario</Text>
        {ownerBookings.map((booking) => (
          <Text key={booking.id} style={styles.row}>
            {booking.status} | {new Date(booking.startDatetime).toLocaleDateString('es-ES')} | {booking.totalPrice.toFixed(2)} EUR
          </Text>
        ))}
        {ownerBookings.length === 0 ? (
          <Text style={styles.subtitle}>Sin reservas como propietario.</Text>
        ) : null}
      </View>
    </View>
  );
}
