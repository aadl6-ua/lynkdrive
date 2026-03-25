import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { httpClient } from '../../api/http';
import { resolveStoredImageUrl } from '../../api/storage';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
import { StatusChip } from '../../app/components/ui/StatusChip';
import { styles } from '../../app/styles';
import { parseLocaleNumber } from '../../shared/number';
import { useGeocodingSuggestions } from '../../shared/useGeocodingSuggestions';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { canUseTransactionalFlows, hasMinimumProfileData } from '../../shared/verification';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';
import { useVehicleAvailabilityWindowsStore } from '../../store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../../store/useVehicleImagesStore';
import { useVehiclesStore } from '../../store/useVehiclesStore';

type ExploreScreenMode = 'list' | 'detail';

type UserMiniProfile = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

type VehicleBookingItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
};

type ExploreVehicle = {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  year: number;
  pricePerDay: number;
  locationAddress: string;
  fuelType: string | null;
  transmission: string | null;
  seats: number | null;
  description: string;
};

type AvailabilityWindowItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
};

type VehicleImageItem = {
  imageUrl: string;
};

function getBookingStatusLabel(status: VehicleBookingItem['status']): string {
  const map: Record<VehicleBookingItem['status'], string> = {
    pending: 'Pendiente',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    paid_confirmed: 'Pago confirmado',
    in_progress: 'En curso',
    completed: 'Completada',
    cancelled: 'Cancelada'
  };

  return map[status];
}

function getUserFullName(profile?: UserMiniProfile): string {
  if (!profile) {
    return 'Usuario';
  }

  return `${profile.firstName} ${profile.lastName}`.trim();
}

function getInitials(profile?: UserMiniProfile): string {
  if (!profile) {
    return 'U';
  }

  const first = profile.firstName?.[0] ?? '';
  const last = profile.lastName?.[0] ?? '';
  const initials = `${first}${last}`.toUpperCase();

  return initials || 'U';
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

export function ExploreScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const desktopCardStyle = isDesktopWeb ? localStyles.desktopCard : undefined;

  const [screenMode, setScreenMode] = useState<ExploreScreenMode>('list');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [exploreMaxPriceInput, setExploreMaxPriceInput] = useState('');
  const [exploreFuelTypeInput, setExploreFuelTypeInput] = useState('');
  const [exploreTransmissionInput, setExploreTransmissionInput] = useState('');
  const [exploreSeatsInput, setExploreSeatsInput] = useState('');
  const [exploreAddressInput, setExploreAddressInput] = useState('');
  const [exploreSelectedLocation, setExploreSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [exploreRadiusInput, setExploreRadiusInput] = useState('');
  const [exploreFiltersError, setExploreFiltersError] = useState<string | null>(null);
  const [bookingStartInput, setBookingStartInput] = useState('');
  const [bookingEndInput, setBookingEndInput] = useState('');
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [vehicleBookings, setVehicleBookings] = useState<VehicleBookingItem[]>([]);
  const [vehicleBookingsLoading, setVehicleBookingsLoading] = useState(false);
  const [vehicleBookingsError, setVehicleBookingsError] = useState<string | null>(null);

  const { items: vehicles, loading: vehiclesLoading, error: vehiclesError, fetchVehicles } = useVehiclesStore();
  const { userId: authUserId } = useAuthStore();
  const { profile } = useUserProfileStore();
  const [ownerById, setOwnerById] = useState<Record<string, UserMiniProfile>>({});
  const [ownerLookupError, setOwnerLookupError] = useState<string | null>(null);
  const typedVehicles = vehicles as ExploreVehicle[];
  const exploreVehicles = typedVehicles.filter((vehicle: ExploreVehicle) => !authUserId || vehicle.ownerId !== authUserId);
  const imageByVehicleId = useVehiclePrimaryImages(exploreVehicles.map((vehicle: ExploreVehicle) => vehicle.id));
  const {
    items: vehicleImages,
    loading: vehicleImagesLoading,
    error: vehicleImagesError,
    fetchByVehicleId: fetchVehicleImagesByVehicleId
  } = useVehicleImagesStore();
  const {
    items: availabilityWindows,
    loading: availabilityWindowsLoading,
    error: availabilityWindowsError,
    fetchByVehicleId: fetchAvailabilityWindowsByVehicleId
  } = useVehicleAvailabilityWindowsStore();
  const typedAvailabilityWindows = availabilityWindows as AvailabilityWindowItem[];
  const typedVehicleImages = vehicleImages as VehicleImageItem[];
  const {
    suggestions: exploreAddressSuggestions,
    loading: exploreAddressLoading,
    error: exploreAddressError
  } = useGeocodingSuggestions(exploreAddressInput);

  const selectedVehicle = useMemo(
    () => exploreVehicles.find((vehicle: ExploreVehicle) => vehicle.id === selectedVehicleId) ?? null,
    [exploreVehicles, selectedVehicleId]
  );
  const hasRequiredProfileData = hasMinimumProfileData(profile);
  const canTransact = canUseTransactionalFlows(profile);

  const selectedVehicleImageUrls = useMemo(() => {
    return typedVehicleImages
      .map((image: VehicleImageItem) => resolveStoredImageUrl(image.imageUrl))
      .filter((url: string | null): url is string => Boolean(url));
  }, [typedVehicleImages]);

  const ownerIds = useMemo(
    () => Array.from(new Set(exploreVehicles.map((vehicle: ExploreVehicle) => vehicle.ownerId))).sort(),
    [exploreVehicles]
  );

  const ownerIdsKey = ownerIds.join('|');

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    if (screenMode !== 'detail' || !selectedVehicleId) {
      return;
    }

    void Promise.all([
      fetchVehicleImagesByVehicleId(selectedVehicleId),
      fetchAvailabilityWindowsByVehicleId(selectedVehicleId)
    ]);
  }, [screenMode, selectedVehicleId, fetchVehicleImagesByVehicleId, fetchAvailabilityWindowsByVehicleId]);

  useEffect(() => {
    if (screenMode !== 'detail' || !selectedVehicleId) {
      setVehicleBookings([]);
      setVehicleBookingsError(null);
      return;
    }

    let isCancelled = false;

    const loadVehicleBookings = async () => {
      setVehicleBookingsLoading(true);
      setVehicleBookingsError(null);

      try {
        const response = await httpClient.get<VehicleBookingItem[]>(`/bookings/vehicle/${selectedVehicleId}`);

        if (!isCancelled) {
          setVehicleBookings(response.data);
        }
      } catch {
        if (!isCancelled) {
          setVehicleBookingsError('No se pudieron cargar las reservas actuales del vehiculo.');
        }
      } finally {
        if (!isCancelled) {
          setVehicleBookingsLoading(false);
        }
      }
    };

    void loadVehicleBookings();

    return () => {
      isCancelled = true;
    };
  }, [screenMode, selectedVehicleId]);

  useEffect(() => {
    if (ownerIds.length === 0) {
      setOwnerById({});
      setOwnerLookupError(null);
      return;
    }

    let isCancelled = false;

    const loadOwners = async () => {
      try {
        const owners = await Promise.all(
          ownerIds.map(async (ownerId) => {
            const response = await httpClient.get<UserMiniProfile>(`/users/${ownerId}`);
            return response.data;
          })
        );

        if (isCancelled) {
          return;
        }

        const nextMap = owners.reduce<Record<string, UserMiniProfile>>((acc: Record<string, UserMiniProfile>, owner: UserMiniProfile) => {
          acc[owner.id] = owner;
          return acc;
        }, {});

        setOwnerById(nextMap);
        setOwnerLookupError(null);
      } catch {
        if (!isCancelled) {
          setOwnerLookupError('No se pudo cargar la informacion de algunos propietarios.');
        }
      }
    };

    void loadOwners();

    return () => {
      isCancelled = true;
    };
  }, [ownerIdsKey]);

  const handleApplyExploreFilters = async () => {
    const parsedMaxPrice = parseLocaleNumber(exploreMaxPriceInput);
    const parsedSeats = parseLocaleNumber(exploreSeatsInput);
    const parsedRadius = parseLocaleNumber(exploreRadiusInput);

    if (exploreRadiusInput.trim() && Number.isNaN(parsedRadius)) {
      setExploreFiltersError('El radio debe ser un numero valido.');
      return;
    }

    if (exploreAddressInput.trim() && !exploreSelectedLocation) {
      setExploreFiltersError('Selecciona una direccion sugerida para aplicar filtro por ubicacion.');
      return;
    }

    setExploreFiltersError(null);

    await fetchVehicles({
      maxPrice: exploreMaxPriceInput.trim() && !Number.isNaN(parsedMaxPrice) ? parsedMaxPrice : undefined,
      fuelType: ['gasoline', 'diesel', 'electric', 'hybrid'].includes(exploreFuelTypeInput)
        ? (exploreFuelTypeInput as 'gasoline' | 'diesel' | 'electric' | 'hybrid')
        : undefined,
      transmission: ['manual', 'automatic'].includes(exploreTransmissionInput)
        ? (exploreTransmissionInput as 'manual' | 'automatic')
        : undefined,
      seats: exploreSeatsInput.trim() && !Number.isNaN(parsedSeats) ? parsedSeats : undefined,
      lat: exploreSelectedLocation?.lat,
      lng: exploreSelectedLocation?.lng,
      radiusKm: exploreRadiusInput.trim() && !Number.isNaN(parsedRadius) ? parsedRadius : undefined
    });
  };

  const handleClearExploreFilters = async () => {
    setExploreMaxPriceInput('');
    setExploreFuelTypeInput('');
    setExploreTransmissionInput('');
    setExploreSeatsInput('');
    setExploreAddressInput('');
    setExploreSelectedLocation(null);
    setExploreRadiusInput('');
    setExploreFiltersError(null);
    await fetchVehicles();
  };

  const handleExploreAddressChange = (value: string) => {
    setExploreAddressInput(value);
    setExploreSelectedLocation(null);
    setExploreFiltersError(null);
  };

  const handleSelectExploreAddress = (label: string, lat: number, lng: number) => {
    setExploreAddressInput(label);
    setExploreSelectedLocation({ lat, lng });
    setExploreFiltersError(null);
  };

  const handleOpenVehicleDetails = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setScreenMode('detail');
    setBookingStartInput('');
    setBookingEndInput('');
    setBookingError(null);
    setBookingMessage(null);
    setVehicleBookings([]);
    setVehicleBookingsError(null);
  };

  const handleBackToExploreList = () => {
    setScreenMode('list');
    setSelectedVehicleId(null);
    setBookingStartInput('');
    setBookingEndInput('');
    setBookingError(null);
    setBookingMessage(null);
  };

  const handleCreateBooking = async () => {
    if (!selectedVehicleId) {
      return;
    }

    if (!authUserId) {
      setBookingError('Debes iniciar sesion para solicitar una reserva.');
      setBookingMessage(null);
      return;
    }

    if (!hasRequiredProfileData) {
      setBookingError('Completa nombre, apellidos y telefono en Perfil antes de solicitar una reserva.');
      setBookingMessage(null);
      return;
    }

    if (!canTransact) {
      setBookingError('Necesitas verificacion documental para solicitar reservas. Ve a Perfil > Documentacion.');
      setBookingMessage(null);
      return;
    }

    const start = bookingStartInput.trim();
    const end = bookingEndInput.trim();

    if (!start || !end) {
      setBookingError('Debes informar fecha/hora de inicio y de fin en formato ISO.');
      setBookingMessage(null);
      return;
    }

    setBookingSaving(true);
    setBookingError(null);
    setBookingMessage(null);

    try {
      await httpClient.post('/bookings', {
        vehicleId: selectedVehicleId,
        startDatetime: start,
        endDatetime: end
      });

      const bookingsResponse = await httpClient.get<VehicleBookingItem[]>(`/bookings/vehicle/${selectedVehicleId}`);
      setVehicleBookings(bookingsResponse.data);

      setBookingMessage('Solicitud enviada. Puedes revisar el estado en la pestana Mis Viajes.');
      setBookingStartInput('');
      setBookingEndInput('');
    } catch (error: unknown) {
      const apiMessage = getApiErrorMessage(error);
      setBookingError(
        apiMessage ??
          'No se pudo crear la reserva. Revisa formato ISO, disponibilidad y que no exista solape con otra reserva.'
      );
    } finally {
      setBookingSaving(false);
    }
  };

  if (screenMode === 'detail' && selectedVehicle) {
    const selectedOwner = ownerById[selectedVehicle.ownerId];
    const selectedOwnerAvatarUrl = resolveStoredImageUrl(selectedOwner?.avatarUrl ?? null);

    return (
      <View style={styles.sectionCard}>
        <SectionHeader
          title={`${selectedVehicle.brand} ${selectedVehicle.model}`}
          subtitle="Ficha completa del vehiculo para decidir tu reserva."
        />

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Volver a explorar" onPress={handleBackToExploreList} />
          </View>
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <View style={localStyles.personRow}>
            {selectedOwnerAvatarUrl ? (
              <Image source={{ uri: selectedOwnerAvatarUrl }} style={localStyles.personAvatar} resizeMode="cover" />
            ) : (
              <View style={localStyles.personAvatarFallback}>
                <Text style={localStyles.personAvatarFallbackText}>{getInitials(selectedOwner)}</Text>
              </View>
            )}
            <View style={localStyles.personInfo}>
              <Text style={localStyles.personRoleLabel}>Propietario</Text>
              <Text style={localStyles.personName}>{getUserFullName(selectedOwner)}</Text>
            </View>
          </View>

          {vehicleImagesLoading || availabilityWindowsLoading ? <ActivityIndicator size="small" /> : null}
          {vehicleImagesError ? <Text style={styles.error}>{vehicleImagesError}</Text> : null}
          {availabilityWindowsError ? <Text style={styles.error}>{availabilityWindowsError}</Text> : null}
          {ownerLookupError ? <Text style={styles.error}>{ownerLookupError}</Text> : null}

          <Text style={styles.switcherTitle}>Fotos</Text>
          {selectedVehicleImageUrls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.galleryRow}>
              {selectedVehicleImageUrls.map((imageUrl: string, index: number) => (
                <Image key={`${selectedVehicle.id}-${index}`} source={{ uri: imageUrl }} style={localStyles.galleryImage} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.vehicleCardMediaPlaceholder, localStyles.detailHeroPlaceholder]}>
              <Text style={styles.vehicleCardMediaPlaceholderText}>Este vehiculo aun no tiene fotos publicadas.</Text>
            </View>
          )}

          <Text style={styles.switcherTitle}>Detalles</Text>
          <Text style={styles.row}><Text style={styles.label}>Ano:</Text> {selectedVehicle.year}</Text>
          <Text style={styles.row}><Text style={styles.label}>Precio/dia:</Text> {selectedVehicle.pricePerDay.toFixed(2)} EUR</Text>
          <Text style={styles.row}><Text style={styles.label}>Ubicacion:</Text> {selectedVehicle.locationAddress}</Text>
          <Text style={styles.row}><Text style={styles.label}>Combustible:</Text> {selectedVehicle.fuelType ?? 'No definido'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Transmision:</Text> {selectedVehicle.transmission ?? 'No definida'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Plazas:</Text> {selectedVehicle.seats ?? 'No definidas'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Descripcion:</Text> {selectedVehicle.description}</Text>

          <Text style={styles.switcherTitle}>Solicitar reserva</Text>
          <View style={localStyles.bookingCard}>
            <View style={styles.actionsRow}>
              <StatusChip label={hasRequiredProfileData ? 'Perfil minimo: OK' : 'Perfil minimo: pendiente'} />
              <StatusChip label={canTransact ? 'Documentacion: verificada' : 'Documentacion: pendiente'} />
            </View>
            <TextInput
              value={bookingStartInput}
              onChangeText={setBookingStartInput}
              style={styles.input}
              placeholder="Inicio ISO (ej: 2026-03-20T10:00:00Z)"
              autoCapitalize="none"
            />
            <TextInput
              value={bookingEndInput}
              onChangeText={setBookingEndInput}
              style={styles.input}
              placeholder="Fin ISO (ej: 2026-03-22T10:00:00Z)"
              autoCapitalize="none"
            />
            <View style={styles.buttonContainer}>
              <Button
                title={bookingSaving ? 'Solicitando...' : 'Solicitar reserva'}
                onPress={() => void handleCreateBooking()}
                disabled={bookingSaving || !canTransact}
              />
            </View>
            {bookingError ? <Text style={styles.error}>{bookingError}</Text> : null}
            {bookingMessage ? <Text style={styles.info}>{bookingMessage}</Text> : null}
            <Text style={styles.linkHint}>Formato esperado: fecha/hora en ISO UTC (terminado en Z).</Text>
          </View>

          <Text style={styles.switcherTitle}>Ventanas de disponibilidad</Text>
          {availabilityWindows.length > 0 ? (
            typedAvailabilityWindows.map((window: AvailabilityWindowItem) => (
              <View key={window.id} style={localStyles.availabilityRow}>
                <Text style={styles.row}><Text style={styles.label}>Inicio:</Text> {new Date(window.startDatetime).toLocaleString('es-ES')}</Text>
                <Text style={styles.row}><Text style={styles.label}>Fin:</Text> {new Date(window.endDatetime).toLocaleString('es-ES')}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.subtitle}>No hay ventanas de disponibilidad publicadas todavia.</Text>
          )}

          <Text style={styles.switcherTitle}>Reservas del vehiculo</Text>
          {vehicleBookingsLoading ? <ActivityIndicator size="small" /> : null}
          {vehicleBookingsError ? <Text style={styles.error}>{vehicleBookingsError}</Text> : null}
          {vehicleBookings.length > 0 ? (
            vehicleBookings.map((booking) => (
              <View key={booking.id} style={localStyles.reservedRow}>
                <Text style={styles.row}><Text style={styles.label}>Estado:</Text> {getBookingStatusLabel(booking.status)}</Text>
                <Text style={styles.row}><Text style={styles.label}>Inicio:</Text> {new Date(booking.startDatetime).toLocaleString('es-ES')}</Text>
                <Text style={styles.row}><Text style={styles.label}>Fin:</Text> {new Date(booking.endDatetime).toLocaleString('es-ES')}</Text>
              </View>
            ))
          ) : (
            !vehicleBookingsLoading && (
              <Text style={styles.subtitle}>No hay reservas registradas para este vehiculo todavia.</Text>
            )
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.sectionCard}>
      <SectionHeader title="Explorar" subtitle="Listado de vehiculos cercanos, filtros y acceso a ficha." />

      <View style={[styles.card, desktopCardStyle]}>
        <Text style={styles.switcherTitle}>Filtros</Text>
        <TextInput
          value={exploreMaxPriceInput}
          onChangeText={setExploreMaxPriceInput}
          style={styles.input}
          placeholder="Precio maximo (EUR)"
          keyboardType="decimal-pad"
        />
        <TextInput
          value={exploreFuelTypeInput}
          onChangeText={setExploreFuelTypeInput}
          style={styles.input}
          placeholder="Combustible: gasoline|diesel|electric|hybrid"
          autoCapitalize="none"
        />
        <TextInput
          value={exploreTransmissionInput}
          onChangeText={setExploreTransmissionInput}
          style={styles.input}
          placeholder="Transmision: manual|automatic"
          autoCapitalize="none"
        />
        <TextInput
          value={exploreSeatsInput}
          onChangeText={setExploreSeatsInput}
          style={styles.input}
          placeholder="Plazas minimas"
          keyboardType="number-pad"
        />
        <TextInput
          value={exploreAddressInput}
          onChangeText={handleExploreAddressChange}
          style={styles.input}
          placeholder="Direccion para buscar por zona"
        />
        {exploreAddressLoading ? <Text style={styles.linkHint}>Buscando direcciones...</Text> : null}
        {exploreAddressError ? <Text style={styles.error}>{exploreAddressError}</Text> : null}
        {exploreAddressSuggestions.length > 0 && !exploreSelectedLocation ? (
          <View style={localStyles.suggestionsList}>
            {exploreAddressSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                style={localStyles.suggestionItem}
                onPress={() => handleSelectExploreAddress(suggestion.label, suggestion.lat, suggestion.lng)}
              >
                <Text style={localStyles.suggestionLabel}>{suggestion.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {exploreSelectedLocation ? (
          <Text style={styles.linkHint}>
            Ubicacion seleccionada: {exploreSelectedLocation.lat.toFixed(5)}, {exploreSelectedLocation.lng.toFixed(5)}
          </Text>
        ) : null}
        <TextInput
          value={exploreRadiusInput}
          onChangeText={setExploreRadiusInput}
          style={styles.input}
          placeholder="Radio (km)"
          keyboardType="decimal-pad"
        />
        {exploreFiltersError ? <Text style={styles.error}>{exploreFiltersError}</Text> : null}

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Aplicar" onPress={() => void handleApplyExploreFilters()} />
          </View>
          <View style={styles.actionButtonWrapper}>
            <Button title="Limpiar" onPress={() => void handleClearExploreFilters()} />
          </View>
        </View>
      </View>

      {vehiclesLoading ? <ActivityIndicator size="small" /> : null}
      {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
      {ownerLookupError ? <Text style={styles.error}>{ownerLookupError}</Text> : null}

      {exploreVehicles.map((vehicle: ExploreVehicle) => (
        <Pressable key={vehicle.id} style={[styles.card, desktopCardStyle]} onPress={() => handleOpenVehicleDetails(vehicle.id)}>
          {(() => {
            const owner = ownerById[vehicle.ownerId];
            const ownerAvatarUrl = resolveStoredImageUrl(owner?.avatarUrl ?? null);

            return (
              <View style={localStyles.personRowCompact}>
                {ownerAvatarUrl ? (
                  <Image source={{ uri: ownerAvatarUrl }} style={localStyles.personAvatarCompact} resizeMode="cover" />
                ) : (
                  <View style={localStyles.personAvatarFallbackCompact}>
                    <Text style={localStyles.personAvatarFallbackCompactText}>{getInitials(owner)}</Text>
                  </View>
                )}
                <View style={localStyles.personInfo}>
                  <Text style={localStyles.personRoleLabel}>Propietario</Text>
                  <Text style={localStyles.personName}>{getUserFullName(owner)}</Text>
                </View>
              </View>
            );
          })()}

          {resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null) ? (
            <Image
              source={{ uri: resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null) ?? '' }}
              style={styles.vehicleCardMedia}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.vehicleCardMediaPlaceholder}>
              <Text style={styles.vehicleCardMediaPlaceholderText}>Sin imagen</Text>
            </View>
          )}
          <Text style={styles.cardTitle}>{vehicle.brand} {vehicle.model}</Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Ano:</Text> {vehicle.year}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Precio/dia:</Text> {vehicle.pricePerDay.toFixed(2)} EUR
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Ubicacion:</Text> {vehicle.locationAddress}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Combustible:</Text> {vehicle.fuelType ?? 'No definido'}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Transmision:</Text> {vehicle.transmission ?? 'No definida'}
          </Text>
          <Text style={styles.linkHint}>Toca para ver ficha completa, fotos y disponibilidad</Text>
        </Pressable>
      ))}

      {!vehiclesLoading && !vehiclesError && exploreVehicles.length === 0 ? (
        <EmptyState title="Sin resultados" description="No hay vehiculos disponibles todavia." />
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
  galleryRow: {
    gap: 10,
    paddingVertical: 4
  },
  galleryImage: {
    width: 240,
    height: 160,
    borderRadius: 10,
    backgroundColor: '#e8ecf4'
  },
  detailHeroPlaceholder: {
    height: 160
  },
  availabilityRow: {
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 10,
    padding: 10,
    gap: 4
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: '#fbfcff'
  },
  reservedRow: {
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: '#fbfcff'
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 10,
    backgroundColor: '#fbfcff'
  },
  personRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4
  },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e8ecf4'
  },
  personAvatarCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e8ecf4'
  },
  personAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dfe7f7'
  },
  personAvatarFallbackCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dfe7f7'
  },
  personAvatarFallbackText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3f6b'
  },
  personAvatarFallbackCompactText: {
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#1e2c4f'
  },
  suggestionsList: {
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden'
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1f7'
  },
  suggestionLabel: {
    fontSize: 13,
    color: '#1e2c4f'
  }
});
