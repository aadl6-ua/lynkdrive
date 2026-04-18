import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { resolveStoredImageUrl } from '../../api/storage';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
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
  pricePerDayAtBooking: number;
  platformFee: number;
  payoutStatus: 'pending' | 'processing' | 'paid' | 'failed';
  ownerContactMethod: string | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
};

type TripsRoleView = 'driver' | 'owner';

type UserMiniProfile = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

type VehicleMiniInfo = {
  id: string;
  brand: string;
  model: string;
  year: number;
};

const STATUS_LABEL: Record<BookingItem['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  paid_confirmed: 'Pago confirmado',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada'
};

const STATUS_COLORS: Record<BookingItem['status'], { background: string; text: string }> = {
  pending: { background: '#fff4cc', text: '#7a5a00' },
  accepted: { background: '#dff2ff', text: '#0e4670' },
  rejected: { background: '#fde2e2', text: '#7a1f1f' },
  paid_confirmed: { background: '#e6f5e8', text: '#1f6a2d' },
  in_progress: { background: '#e4ecff', text: '#1f3f8a' },
  completed: { background: '#e3f7ef', text: '#125238' },
  cancelled: { background: '#f1f3f5', text: '#495057' }
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

function getDurationDays(startDatetime: string, endDatetime: string): number {
  const start = new Date(startDatetime).getTime();
  const end = new Date(endDatetime).getTime();
  const diffMs = Math.max(0, end - start);
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function getShortId(id: string): string {
  return id.slice(0, 8);
}

function getUserDisplayName(profile?: UserMiniProfile): string {
  if (!profile) {
    return 'Usuario';
  }

  return `${profile.firstName} ${profile.lastName}`.trim();
}

function getUserInitials(profile?: UserMiniProfile): string {
  if (!profile) {
    return 'U';
  }

  const first = profile.firstName?.[0] ?? '';
  const last = profile.lastName?.[0] ?? '';
  const initials = `${first}${last}`.toUpperCase();

  return initials || 'U';
}

function getVehicleLabel(vehicle?: VehicleMiniInfo): string {
  if (!vehicle) {
    return 'Vehiculo';
  }

  return `${vehicle.brand} ${vehicle.model} (${vehicle.year})`;
}

function getApiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
  const message = response?.data?.message;

  if (Array.isArray(message)) {
    return message.join('. ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return null;
}

function canCancelBooking(booking: BookingItem): boolean {
  const cancellableStatuses: BookingItem['status'][] = ['pending', 'accepted', 'paid_confirmed'];
  return cancellableStatuses.includes(booking.status) && new Date(booking.startDatetime).getTime() > Date.now();
}

export function TripsScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const desktopCardStyle = isDesktopWeb ? localStyles.desktopCard : undefined;

  const { userId: authUserId } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [driverBookings, setDriverBookings] = useState<BookingItem[]>([]);
  const [ownerBookings, setOwnerBookings] = useState<BookingItem[]>([]);
  const [roleView, setRoleView] = useState<TripsRoleView>('driver');
  const [userById, setUserById] = useState<Record<string, UserMiniProfile>>({});
  const [vehicleById, setVehicleById] = useState<Record<string, VehicleMiniInfo>>({});
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!authUserId) {
      setDriverBookings([]);
      setOwnerBookings([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setMutationError(null);

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

  const handleCancelBooking = async (bookingId: string) => {
    setCancelingBookingId(bookingId);
    setMutationError(null);
    setMutationMessage(null);

    try {
      await httpClient.put(`/bookings/${bookingId}/status`, { status: 'cancelled' });
      setMutationMessage('Reserva cancelada correctamente.');
      await loadBookings();
    } catch (error: unknown) {
      const apiMessage = getApiErrorMessage(error);
      setMutationError(apiMessage ?? 'No se pudo cancelar la reserva.');
    } finally {
      setCancelingBookingId(null);
    }
  };

  const activeBookings = roleView === 'driver' ? driverBookings : ownerBookings;

  const bookingSummary = useMemo(() => {
    const total = activeBookings.length;
    const pendingOrInProgress = activeBookings.filter((booking) =>
      ['pending', 'accepted', 'paid_confirmed', 'in_progress'].includes(booking.status)
    ).length;
    const completed = activeBookings.filter((booking) => booking.status === 'completed').length;
    const totalAmount = activeBookings.reduce((sum, booking) => sum + booking.totalPrice, 0);

    return {
      total,
      pendingOrInProgress,
      completed,
      totalAmount
    };
  }, [activeBookings]);

  const sortedBookings = useMemo(() => {
    return [...activeBookings].sort(
      (a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime()
    );
  }, [activeBookings]);

  const allBookings = useMemo(() => [...driverBookings, ...ownerBookings], [driverBookings, ownerBookings]);
  const relatedUserIds = useMemo(
    () => Array.from(new Set(allBookings.flatMap((booking) => [booking.ownerId, booking.driverId]))).sort(),
    [allBookings]
  );
  const relatedVehicleIds = useMemo(
    () => Array.from(new Set(allBookings.map((booking) => booking.vehicleId))).sort(),
    [allBookings]
  );

  useEffect(() => {
    if (relatedUserIds.length === 0 && relatedVehicleIds.length === 0) {
      setUserById({});
      setVehicleById({});
      setLookupError(null);
      return;
    }

    let isCancelled = false;

    const loadRelatedData = async () => {
      try {
        const [users, vehicles] = await Promise.all([
          Promise.all(
            relatedUserIds.map(async (userId) => {
              const response = await httpClient.get<UserMiniProfile>(`/users/${userId}`);
              return response.data;
            })
          ),
          Promise.all(
            relatedVehicleIds.map(async (vehicleId) => {
              const response = await httpClient.get<VehicleMiniInfo>(`/vehicles/${vehicleId}`);
              return response.data;
            })
          )
        ]);

        if (isCancelled) {
          return;
        }

        setUserById(
          users.reduce<Record<string, UserMiniProfile>>((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {})
        );

        setVehicleById(
          vehicles.reduce<Record<string, VehicleMiniInfo>>((acc, vehicle) => {
            acc[vehicle.id] = vehicle;
            return acc;
          }, {})
        );

        setLookupError(null);
      } catch {
        if (!isCancelled) {
          setLookupError('No se pudo cargar toda la informacion de usuarios o vehiculos.');
        }
      }
    };

    void loadRelatedData();

    return () => {
      isCancelled = true;
    };
  }, [relatedUserIds.join('|'), relatedVehicleIds.join('|')]);

  if (!authUserId) {
    return (
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Mis Viajes"
          subtitle="Inicia sesion para ver reservas como conductor y propietario."
          centered={isDesktopWeb}
        />
      </View>
    );
  }

  return (
    <View style={styles.sectionCard}>
      <SectionHeader
        title="Mis Viajes"
        subtitle="Consulta tus reservas como conductor o como propietario con mas detalle."
        centered={isDesktopWeb}
      />

      <View style={[styles.card, desktopCardStyle]}>
        <Text style={styles.switcherTitle}>Vista</Text>
        <View style={styles.actionsRow}>
          <Pressable
            style={[
              localStyles.roleButton,
              roleView === 'driver' ? localStyles.roleButtonActive : undefined
            ]}
            onPress={() => setRoleView('driver')}
          >
            <Text
              style={[
                localStyles.roleButtonText,
                roleView === 'driver' ? localStyles.roleButtonTextActive : undefined
              ]}
            >
              Como conductor
            </Text>
          </Pressable>
          <Pressable
            style={[
              localStyles.roleButton,
              roleView === 'owner' ? localStyles.roleButtonActive : undefined
            ]}
            onPress={() => setRoleView('owner')}
          >
            <Text
              style={[
                localStyles.roleButtonText,
                roleView === 'owner' ? localStyles.roleButtonTextActive : undefined
              ]}
            >
              Como propietario
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, desktopCardStyle]}>
        <Text style={styles.switcherTitle}>Resumen rapido</Text>
        <Text style={styles.row}><Text style={styles.label}>Total reservas:</Text> {bookingSummary.total}</Text>
        <Text style={styles.row}><Text style={styles.label}>Activas/Pendientes:</Text> {bookingSummary.pendingOrInProgress}</Text>
        <Text style={styles.row}><Text style={styles.label}>Completadas:</Text> {bookingSummary.completed}</Text>
        <Text style={styles.row}><Text style={styles.label}>Importe acumulado:</Text> {formatCurrency(bookingSummary.totalAmount)}</Text>
      </View>

      <View style={[styles.buttonContainer, desktopCardStyle]}>
        <Button title="Recargar reservas" onPress={() => void loadBookings()} />
      </View>

      {loading ? <ActivityIndicator size="small" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
      {mutationError ? <Text style={styles.error}>{mutationError}</Text> : null}
      {mutationMessage ? <Text style={styles.info}>{mutationMessage}</Text> : null}

      {sortedBookings.map((booking) => {
        const statusColors = STATUS_COLORS[booking.status];
        const ownerProfile = userById[booking.ownerId];
        const driverProfile = userById[booking.driverId];
        const ownerAvatarUrl = resolveStoredImageUrl(ownerProfile?.avatarUrl ?? null);
        const driverAvatarUrl = resolveStoredImageUrl(driverProfile?.avatarUrl ?? null);
        const vehicleLabel = getVehicleLabel(vehicleById[booking.vehicleId]);

        return (
          <View key={booking.id} style={[styles.card, desktopCardStyle]}>
            <View style={localStyles.bookingHeaderRow}>
              <Text style={styles.cardTitle}>Reserva #{getShortId(booking.id)}</Text>
              <View style={[localStyles.statusPill, { backgroundColor: statusColors.background }]}>
                <Text style={[localStyles.statusPillText, { color: statusColors.text }]}>
                  {STATUS_LABEL[booking.status]}
                </Text>
              </View>
            </View>

            <Text style={styles.row}><Text style={styles.label}>Periodo:</Text> {formatDateTime(booking.startDatetime)} - {formatDateTime(booking.endDatetime)}</Text>
            <Text style={styles.row}><Text style={styles.label}>Duracion estimada:</Text> {getDurationDays(booking.startDatetime, booking.endDatetime)} dias</Text>
            <Text style={styles.row}><Text style={styles.label}>Vehiculo:</Text> {vehicleLabel}</Text>

            <View style={localStyles.peopleSection}>
              <View style={localStyles.personRow}>
                {ownerAvatarUrl ? (
                  <Image source={{ uri: ownerAvatarUrl }} style={localStyles.personAvatar} resizeMode="cover" />
                ) : (
                  <View style={localStyles.personAvatarFallback}>
                    <Text style={localStyles.personAvatarFallbackText}>{getUserInitials(ownerProfile)}</Text>
                  </View>
                )}
                <View style={localStyles.personInfo}>
                  <Text style={localStyles.personRoleLabel}>Propietario</Text>
                  <Text style={localStyles.personName}>{getUserDisplayName(ownerProfile)}</Text>
                </View>
              </View>

              <View style={localStyles.personRow}>
                {driverAvatarUrl ? (
                  <Image source={{ uri: driverAvatarUrl }} style={localStyles.personAvatar} resizeMode="cover" />
                ) : (
                  <View style={localStyles.personAvatarFallback}>
                    <Text style={localStyles.personAvatarFallbackText}>{getUserInitials(driverProfile)}</Text>
                  </View>
                )}
                <View style={localStyles.personInfo}>
                  <Text style={localStyles.personRoleLabel}>Conductor</Text>
                  <Text style={localStyles.personName}>{getUserDisplayName(driverProfile)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.row}><Text style={styles.label}>Total:</Text> {formatCurrency(booking.totalPrice)}</Text>
            <Text style={styles.row}><Text style={styles.label}>Precio/dia (snapshot):</Text> {formatCurrency(booking.pricePerDayAtBooking)}</Text>
            <Text style={styles.row}><Text style={styles.label}>Comision plataforma:</Text> {formatCurrency(booking.platformFee)}</Text>
            <Text style={styles.row}><Text style={styles.label}>Estado de payout:</Text> {booking.payoutStatus}</Text>
            <Text style={styles.row}><Text style={styles.label}>Contacto owner:</Text> {booking.ownerContactMethod ?? 'No definido'}</Text>
            <Text style={styles.linkHint}>Creada el {formatDateTime(booking.createdAt)}</Text>

            {canCancelBooking(booking) ? (
              <View style={styles.buttonContainer}>
                <Button
                  title={cancelingBookingId === booking.id ? 'Cancelando...' : 'Cancelar reserva'}
                  onPress={() => void handleCancelBooking(booking.id)}
                  color="#b00020"
                  disabled={cancelingBookingId === booking.id}
                />
              </View>
            ) : null}
          </View>
        );
      })}

      {!loading && !error && sortedBookings.length === 0 ? (
        <View style={desktopCardStyle}>
          <EmptyState
            title="Sin reservas"
            description={
              roleView === 'driver'
                ? 'No tienes reservas como conductor todavia.'
                : 'No tienes reservas como propietario todavia.'
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  desktopCard: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center'
  },
  roleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cfd8ea',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#ffffff'
  },
  roleButtonActive: {
    backgroundColor: '#1e2c4f',
    borderColor: '#1e2c4f'
  },
  roleButtonText: {
    textAlign: 'center',
    color: '#33415f',
    fontWeight: '600'
  },
  roleButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  bookingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700'
  },
  peopleSection: {
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: '#fbfcff'
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  personAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e8ecf4'
  },
  personAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dfe7f7'
  },
  personAvatarFallbackText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2c3f6b'
  },
  personInfo: {
    flex: 1
  },
  personRoleLabel: {
    fontSize: 11,
    color: '#5d6b88'
  },
  personName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e2c4f'
  }
});
