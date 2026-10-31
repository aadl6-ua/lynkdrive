import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { httpClient } from '../../api/http';
import { resolveStoredImageUrl } from '../../api/storage';
import {
  colorTokens,
  layoutTokens,
  radiusTokens,
  shadowTokens,
  spacingTokens,
  typographyTokens
} from '../../app/theme/tokens';
import { AppTabKey } from '../../app/types';
import { BookingStatus } from '../../shared/booking';
import { UserOverviewModal } from '../../shared/components/UserOverviewModal';
import { getApiErrorMessage } from '../../shared/errors';
import {
  calendarDayHourToIso,
  formatCurrencyEUR,
  formatDateRangeMadrid,
  formatPriceCompact,
  getBillableDays,
  getDisplayName,
  pluralize,
  translateFuelType,
  translateTransmission
} from '../../shared/format';
import { parseLocaleNumber } from '../../shared/number';
import {
  AppImage,
  Avatar,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ImageCarousel,
  InlineMessage,
  Screen,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusChip,
  TextField,
  VehicleCardSkeleton,
  VerificationGate,
  toast
} from '../../shared/ui';
import { useBackHandler } from '../../shared/useBackHandler';
import { useUserLocation } from '../../shared/useUserLocation';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { canUseTransactionalFlows, hasMinimumProfileData } from '../../shared/verification';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';
import { useVehicleAvailabilityWindowsStore } from '../../store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../../store/useVehicleImagesStore';
import { useVehiclesStore } from '../../store/useVehiclesStore';
import { ExploreVehiclesMap, VehicleLocationMap, type VehicleMarker } from '../maps';
import { CalendarPicker } from './CalendarPicker';
import { AddressSearch } from '../../shared/components/AddressSearch';

type ExploreScreenMode = 'list' | 'detail' | 'map';
type FuelFilter = '' | 'gasoline' | 'diesel' | 'electric' | 'hybrid';
type TransmissionFilter = '' | 'manual' | 'automatic';
type SeatsFilter = '' | '2' | '4' | '5' | '7';

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
  status: BookingStatus;
};

type ExploreVehicle = {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  year: number;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType: string | null;
  transmission: string | null;
  seats: number | null;
  description: string;
};

type FilterDraft = {
  address: string;
  location: { lat: number; lng: number } | null;
  radius: string;
  maxPrice: string;
  fuelType: FuelFilter;
  transmission: TransmissionFilter;
  seats: SeatsFilter;
};

type ExploreScreenProps = {
  topPadding?: number;
  bottomPadding?: number;
  onNavigateToTab?: (tab: AppTabKey) => void;
};

const EMPTY_FILTERS: FilterDraft = {
  address: '',
  location: null,
  radius: '',
  maxPrice: '',
  fuelType: '',
  transmission: '',
  seats: ''
};

const FUEL_OPTIONS: Array<{ label: string; value: FuelFilter }> = [
  { label: 'Todos', value: '' },
  { label: 'Gasolina', value: 'gasoline' },
  { label: 'Diésel', value: 'diesel' },
  { label: 'Eléctrico', value: 'electric' },
  { label: 'Híbrido', value: 'hybrid' }
];

const TRANSMISSION_OPTIONS: Array<{ label: string; value: TransmissionFilter }> = [
  { label: 'Todas', value: '' },
  { label: 'Manual', value: 'manual' },
  { label: 'Automático', value: 'automatic' }
];

const SEATS_OPTIONS: Array<{ label: string; value: SeatsFilter }> = [
  { label: 'Cualquiera', value: '' },
  { label: '2', value: '2' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '7', value: '7' }
];

const RADIUS_PRESETS = ['5', '10', '25', '50', '100'];

/** Distancia en km entre dos coordenadas (fórmula de Haversine). */
function getDistanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(km: number): string {
  return km < 1 ? `a ${Math.round(km * 1000)} m` : `a ${km.toLocaleString('es-ES', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

function countActiveFilters(filters: FilterDraft): number {
  return [filters.location, filters.maxPrice.trim(), filters.fuelType, filters.transmission, filters.seats].filter(Boolean)
    .length;
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.chipGroupLabel}>{label}</Text>
      <View style={styles.chipGroupRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const active = option.value === value;

          return (
            <Pressable
              key={option.value || 'all'}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${label}: ${option.label}`}
              style={({ pressed }) => [
                styles.choiceChip,
                active ? styles.choiceChipActive : null,
                pressed && !active ? styles.choiceChipPressed : null
              ]}
            >
              <Text style={[styles.choiceChipText, active ? styles.choiceChipTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ExploreScreen({ topPadding = 0, bottomPadding = 0, onNavigateToTab }: ExploreScreenProps) {
  const { width, height } = useWindowDimensions();

  const [screenMode, setScreenMode] = useState<ExploreScreenMode>('list');
  const [lastListMode, setLastListMode] = useState<'list' | 'map'>('list');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Filtros aplicados (los que se envían a la API) y borrador editable en la hoja.
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [showSearchRow, setShowSearchRow] = useState(true);
  const lastScrollYRef = useRef(0);

  const [bookingStartDate, setBookingStartDate] = useState<Date | null>(null);
  const [bookingStartHour, setBookingStartHour] = useState(10);
  const [bookingEndDate, setBookingEndDate] = useState<Date | null>(null);
  const [bookingEndHour, setBookingEndHour] = useState(18);
  const [calendarKey, setCalendarKey] = useState(0);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSent, setBookingSent] = useState(false);
  const [hasShownLocationPrompt, setHasShownLocationPrompt] = useState(false);
  const [overviewUser, setOverviewUser] = useState<{ id: string; displayName: string; avatarUrl: string | null } | null>(
    null
  );

  const [vehicleBookings, setVehicleBookings] = useState<VehicleBookingItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { items: vehicles, loading: vehiclesLoading, error: vehiclesError, fetchVehicles } = useVehiclesStore();
  const { userId: authUserId } = useAuthStore();
  const { profile } = useUserProfileStore();
  const [ownerById, setOwnerById] = useState<Record<string, UserMiniProfile>>({});

  const exploreVehicles = useMemo(
    () => (vehicles as ExploreVehicle[]).filter((vehicle) => !authUserId || vehicle.ownerId !== authUserId),
    [vehicles, authUserId]
  );
  const imageByVehicleId = useVehiclePrimaryImages(exploreVehicles.map((vehicle) => vehicle.id));

  const {
    items: vehicleImages,
    loading: vehicleImagesLoading,
    fetchByVehicleId: fetchVehicleImagesByVehicleId
  } = useVehicleImagesStore();

  const {
    items: availabilityWindows,
    loading: availabilityWindowsLoading,
    error: availabilityWindowsError,
    fetchByVehicleId: fetchAvailabilityWindowsByVehicleId
  } = useVehicleAvailabilityWindowsStore();

  const {
    permissionStatus,
    coords: userLocationCoords,
    refreshPermissionStatus,
    requestPermission,
    refreshLocation,
    clearLocationError
  } = useUserLocation();

  const selectedVehicle = useMemo(
    () => exploreVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [exploreVehicles, selectedVehicleId]
  );

  const hasRequiredProfileData = hasMinimumProfileData(profile);
  const canTransact = canUseTransactionalFlows(profile);
  const activeFilterCount = countActiveFilters(appliedFilters);

  const selectedVehicleImageUrls = useMemo(
    () =>
      [...vehicleImages]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((image) => resolveStoredImageUrl(image.imageUrl))
        .filter((url): url is string => Boolean(url)),
    [vehicleImages]
  );

  const ownerIdsKey = useMemo(
    () => Array.from(new Set(exploreVehicles.map((vehicle) => vehicle.ownerId))).sort().join('|'),
    [exploreVehicles]
  );

  const userPoint =
    permissionStatus === 'granted' && userLocationCoords
      ? { latitude: userLocationCoords.latitude, longitude: userLocationCoords.longitude }
      : null;

  // Con una ubicación buscada la API ya ordena por cercanía a ese punto; si no, se ordena
  // por cercanía al usuario cuando ha dado permiso de ubicación.
  const listVehicles = useMemo(() => {
    if (appliedFilters.location || !userPoint) {
      return exploreVehicles;
    }

    const distanceTo = (vehicle: ExploreVehicle) =>
      getDistanceKm(userPoint, { latitude: vehicle.locationLat, longitude: vehicle.locationLng });

    return [...exploreVehicles].sort((a, b) => distanceTo(a) - distanceTo(b));
    // userPoint se recrea en cada render; dependemos de sus coordenadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploreVehicles, appliedFilters.location, userPoint?.latitude, userPoint?.longitude]);

  // Columnas de la rejilla según el ancho disponible (centrado con ancho máximo).
  const contentWidth = Math.min(width - spacingTokens.lg * 2, layoutTokens.contentMaxWidth);
  const columns = contentWidth >= 960 ? 3 : contentWidth >= 600 ? 2 : 1;
  const cardWidth = Math.floor((contentWidth - spacingTokens.lg * (columns - 1)) / columns);

  const buildApiFilters = useCallback((filters: FilterDraft) => {
    const maxPrice = parseLocaleNumber(filters.maxPrice);
    const radius = parseLocaleNumber(filters.radius);

    return {
      maxPrice: filters.maxPrice.trim() && !Number.isNaN(maxPrice) ? maxPrice : undefined,
      fuelType: filters.fuelType || undefined,
      transmission: filters.transmission || undefined,
      seats: filters.seats ? Number(filters.seats) : undefined,
      lat: filters.location?.lat,
      lng: filters.location?.lng,
      radiusKm: filters.location && filters.radius.trim() && !Number.isNaN(radius) ? radius : undefined
    };
  }, []);

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  // Si el usuario ya dio permiso de ubicación, mostramos distancias sin volver a preguntar.
  useEffect(() => {
    void (async () => {
      try {
        const status = await refreshPermissionStatus();
        if (status === 'granted') {
          await refreshLocation();
        }
      } catch {
        // Sin ubicación seguimos mostrando el listado normal.
      }
    })();
  }, [refreshPermissionStatus, refreshLocation]);

  const handleRequestLocationPermission = useCallback(async () => {
    clearLocationError();

    if (hasShownLocationPrompt) {
      return;
    }

    setHasShownLocationPrompt(true);
    const nextPermission = await requestPermission();

    if (nextPermission === 'granted') {
      await refreshLocation();
    }
  }, [clearLocationError, hasShownLocationPrompt, refreshLocation, requestPermission]);

  const loadVehicleBookings = useCallback(async (vehicleId: string) => {
    try {
      const response = await httpClient.get<VehicleBookingItem[]>(`/bookings/vehicle/${vehicleId}`);
      setVehicleBookings(response.data);
    } catch {
      // El calendario sigue funcionando con las ventanas; el backend valida solapes.
      setVehicleBookings([]);
    }
  }, []);

  useEffect(() => {
    if (screenMode !== 'detail' || !selectedVehicleId) {
      return;
    }

    void fetchVehicleImagesByVehicleId(selectedVehicleId);
    void fetchAvailabilityWindowsByVehicleId(selectedVehicleId);
    void loadVehicleBookings(selectedVehicleId);
    void handleRequestLocationPermission();
  }, [
    screenMode,
    selectedVehicleId,
    fetchVehicleImagesByVehicleId,
    fetchAvailabilityWindowsByVehicleId,
    loadVehicleBookings,
    handleRequestLocationPermission
  ]);

  useEffect(() => {
    const ownerIds = ownerIdsKey ? ownerIdsKey.split('|') : [];

    if (ownerIds.length === 0) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      // allSettled: un propietario que falle no deja sin nombre al resto.
      const results = await Promise.allSettled(
        ownerIds.map(async (ownerId) => (await httpClient.get<UserMiniProfile>(`/users/${ownerId}`)).data)
      );

      if (isCancelled) {
        return;
      }

      setOwnerById((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === 'fulfilled') {
            next[result.value.id] = result.value;
          }
        }
        return next;
      });
    })();

    return () => {
      isCancelled = true;
    };
  }, [ownerIdsKey]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = currentY - lastScrollYRef.current;

    if (currentY < 80) {
      setShowSearchRow(true);
    } else if (delta > 10) {
      setShowSearchRow(false);
    } else if (delta < -10) {
      setShowSearchRow(true);
    }

    lastScrollYRef.current = currentY;
  };

  const applyFilters = async (next: FilterDraft) => {
    const radius = parseLocaleNumber(next.radius);
    const maxPrice = parseLocaleNumber(next.maxPrice);

    if (next.radius.trim() && (Number.isNaN(radius) || radius <= 0)) {
      setFiltersError('El radio debe ser un número mayor que 0.');
      return false;
    }

    if (next.maxPrice.trim() && (Number.isNaN(maxPrice) || maxPrice <= 0)) {
      setFiltersError('El precio máximo debe ser un número mayor que 0.');
      return false;
    }

    if (next.address.trim() && !next.location) {
      setFiltersError('Elige una de las direcciones sugeridas para filtrar por ubicación.');
      return false;
    }

    setFiltersError(null);
    setAppliedFilters(next);
    setDraft(next);
    await fetchVehicles(buildApiFilters(next));
    return true;
  };

  const handleClearFilters = async () => {
    setDraft(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setFiltersError(null);
    setFiltersOpen(false);
    await fetchVehicles();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchVehicles(buildApiFilters(appliedFilters));
    setRefreshing(false);
  };

  const resetBookingForm = () => {
    setBookingStartDate(null);
    setBookingStartHour(10);
    setBookingEndDate(null);
    setBookingEndHour(18);
    setBookingError(null);
    setCalendarKey((key) => key + 1);
  };

  const handleOpenVehicleDetails = (vehicleId: string) => {
    if (screenMode !== 'detail') {
      setLastListMode(screenMode);
    }
    setSelectedVehicleId(vehicleId);
    setScreenMode('detail');
    setVehicleBookings([]);
    setBookingSent(false);
    resetBookingForm();
  };

  const handleBackToExploreList = () => {
    setScreenMode(lastListMode);
    setSelectedVehicleId(null);
    setBookingSent(false);
    resetBookingForm();
  };

  useBackHandler(screenMode === 'detail', handleBackToExploreList);

  const bookingRange = useMemo(() => {
    if (!bookingStartDate || !bookingEndDate) {
      return null;
    }

    const startISO = calendarDayHourToIso(bookingStartDate, bookingStartHour);
    const endISO = calendarDayHourToIso(bookingEndDate, bookingEndHour);

    return new Date(endISO).getTime() > new Date(startISO).getTime() ? { startISO, endISO } : null;
  }, [bookingStartDate, bookingStartHour, bookingEndDate, bookingEndHour]);

  const handleCreateBooking = async () => {
    if (!selectedVehicleId) {
      return;
    }

    if (!authUserId) {
      setBookingError('Debes iniciar sesión para solicitar una reserva.');
      return;
    }

    if (!hasRequiredProfileData || !canTransact) {
      setBookingError('Completa tu perfil y verifica tu documentación antes de reservar.');
      return;
    }

    if (!bookingStartDate || !bookingEndDate) {
      setBookingError('Selecciona fecha y hora de inicio y fin en el calendario.');
      return;
    }

    if (!bookingRange) {
      setBookingError('La fecha de fin debe ser posterior a la de inicio.');
      return;
    }

    setBookingSaving(true);
    setBookingError(null);

    try {
      await httpClient.post('/bookings', {
        vehicleId: selectedVehicleId,
        startDatetime: bookingRange.startISO,
        endDatetime: bookingRange.endISO
      });

      await loadVehicleBookings(selectedVehicleId);
      resetBookingForm();
      setBookingSent(true);
      toast.success('Solicitud enviada. El propietario la revisará pronto.');
    } catch (error: unknown) {
      setBookingError(
        getApiErrorMessage(
          error,
          'No se pudo crear la reserva. Revisa la disponibilidad y que no se solape con otra reserva.'
        )
      );
    } finally {
      setBookingSaving(false);
    }
  };

  const handleOpenUserOverview = (userId: string, displayName: string, avatarUrl: string | null) => {
    if (authUserId && userId === authUserId) {
      return;
    }

    setOverviewUser({ id: userId, displayName, avatarUrl });
  };

  const overviewModal = (
    <UserOverviewModal
      visible={!!overviewUser}
      userId={overviewUser?.id ?? null}
      displayName={overviewUser?.displayName ?? 'Usuario'}
      avatarUrl={overviewUser?.avatarUrl ?? null}
      onClose={() => setOverviewUser(null)}
    />
  );

  const filtersSheet = (
    <Sheet
      visible={filtersOpen}
      onClose={() => {
        setFiltersOpen(false);
        setDraft(appliedFilters);
        setFiltersError(null);
      }}
      title="Filtros"
      subtitle="Afina la búsqueda por precio y características"
    >
      <View style={styles.sheetSection}>
        <Text style={styles.chipGroupLabel}>Radio de búsqueda</Text>
        <View style={styles.chipGroupRow}>
          {RADIUS_PRESETS.map((preset) => {
            const active = draft.radius === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => setDraft((current) => ({ ...current, radius: active ? '' : preset }))}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: !draft.location }}
                disabled={!draft.location}
                style={[
                  styles.choiceChip,
                  active ? styles.choiceChipActive : null,
                  !draft.location ? styles.choiceChipDisabled : null
                ]}
              >
                <Text style={[styles.choiceChipText, active ? styles.choiceChipTextActive : null]}>{preset} km</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.sheetHint}>
          {draft.location ? 'Distancia máxima desde la ubicación elegida.' : 'Elige primero una ubicación en el buscador.'}
        </Text>
      </View>

      <TextField
        label="Precio máximo por día"
        value={draft.maxPrice}
        onChangeText={(value) => setDraft((current) => ({ ...current, maxPrice: value }))}
        placeholder="Sin límite"
        keyboardType="decimal-pad"
        leftIcon="pricetag-outline"
        right={<Text style={styles.unit}>€</Text>}
      />

      <ChipGroup
        label="Combustible"
        options={FUEL_OPTIONS}
        value={draft.fuelType}
        onChange={(value) => setDraft((current) => ({ ...current, fuelType: value }))}
      />
      <ChipGroup
        label="Transmisión"
        options={TRANSMISSION_OPTIONS}
        value={draft.transmission}
        onChange={(value) => setDraft((current) => ({ ...current, transmission: value }))}
      />
      <ChipGroup
        label="Plazas"
        options={SEATS_OPTIONS}
        value={draft.seats}
        onChange={(value) => setDraft((current) => ({ ...current, seats: value }))}
      />

      {filtersError ? <InlineMessage tone="error" message={filtersError} /> : null}

      <View style={styles.sheetActions}>
        <Button label="Limpiar" variant="secondary" onPress={() => void handleClearFilters()} style={styles.flex1} />
        <Button
          label="Ver resultados"
          onPress={() =>
            void applyFilters(draft).then((ok) => {
              if (ok) {
                setFiltersOpen(false);
              }
            })
          }
          loading={vehiclesLoading}
          style={styles.flex1}
        />
      </View>
    </Sheet>
  );

  const controlsBar = (compact: boolean) => (
    <View style={styles.controls}>
      {!compact ? (
        <AddressSearch
          value={draft.address}
          selected={!!draft.location}
          placeholder="¿Dónde quieres recoger el coche?"
          onChange={(value) => {
            setDraft((current) => ({ ...current, address: value, location: null }));
            setFiltersError(null);
          }}
          onSelect={(label, lat, lng) => {
            const next = { ...draft, address: label, location: { lat, lng }, radius: draft.radius || '25' };
            void applyFilters(next);
          }}
          onClear={() => {
            const next = { ...draft, address: '', location: null, radius: '' };
            void applyFilters(next);
          }}
        />
      ) : null}
      {!compact && filtersError && !filtersOpen ? <InlineMessage tone="error" message={filtersError} /> : null}
      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => {
            setDraft(appliedFilters);
            setFiltersOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Filtros${activeFilterCount ? `, ${activeFilterCount} activos` : ''}`}
          android_ripple={{ color: 'rgba(13,27,42,0.08)' }}
          style={({ pressed }) => [
            styles.filterButton,
            activeFilterCount ? styles.filterButtonActive : null,
            pressed && Platform.OS !== 'android' ? styles.filterButtonPressed : null
          ]}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={activeFilterCount ? colorTokens.white : colorTokens.primary}
          />
          <Text style={[styles.filterButtonText, activeFilterCount ? styles.filterButtonTextActive : null]}>Filtros</Text>
          {activeFilterCount ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <SegmentedControl
          options={[
            { value: 'list', label: 'Lista', icon: 'list-outline' },
            { value: 'map', label: 'Mapa', icon: 'map-outline' }
          ]}
          value={screenMode === 'map' ? 'map' : 'list'}
          onChange={(value) => {
            setScreenMode(value);
            setLastListMode(value);
          }}
          style={styles.segmented}
        />
      </View>
    </View>
  );

  /* ------------------------------------------------------------------------ */
  /* Detalle de vehículo                                                      */
  /* ------------------------------------------------------------------------ */

  if (screenMode === 'detail' && selectedVehicle) {
    const owner = ownerById[selectedVehicle.ownerId];
    const ownerName = owner ? getDisplayName(owner.firstName, owner.lastName) : 'Propietario';
    const ownerAvatarUrl = resolveStoredImageUrl(owner?.avatarUrl ?? null);
    const fuel = translateFuelType(selectedVehicle.fuelType);
    const transmission = translateTransmission(selectedVehicle.transmission);
    const distance = userPoint
      ? getDistanceKm(userPoint, { latitude: selectedVehicle.locationLat, longitude: selectedVehicle.locationLng })
      : null;
    const billableDays = bookingRange ? getBillableDays(bookingRange.startISO, bookingRange.endISO) : null;
    const upcomingBlocked = vehicleBookings
      .filter(
        (booking) =>
          ['accepted', 'paid_confirmed', 'in_progress'].includes(booking.status) &&
          new Date(booking.endDatetime).getTime() > Date.now()
      )
      .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime());
    const isWide = width >= 900;
    const hasFutureWindows = availabilityWindows.some((window) => new Date(window.endDatetime).getTime() > Date.now());

    const infoColumn = (
      <View style={styles.detailColumn}>
        <ImageCarousel
          images={selectedVehicleImageUrls}
          height={isWide ? 380 : 260}
          loading={vehicleImagesLoading && selectedVehicleImageUrls.length === 0}
          emptyLabel="Este vehículo aún no tiene fotos"
        />

        <View style={styles.detailTitleBlock}>
          <View style={styles.detailPrice}>
            <Text style={styles.detailPriceValue}>{formatPriceCompact(selectedVehicle.pricePerDay)}</Text>
            <Text style={styles.detailPriceUnit}>/día</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={colorTokens.textMuted} />
            <Text style={styles.metaText} numberOfLines={2}>
              {selectedVehicle.locationAddress}
              {distance !== null ? ` · ${formatDistance(distance)}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.specGrid}>
          <SpecTile icon="calendar-outline" label="Año" value={String(selectedVehicle.year)} />
          <SpecTile icon="flash-outline" label="Combustible" value={fuel ?? 'No indicado'} />
          <SpecTile icon="cog-outline" label="Cambio" value={transmission ?? 'No indicado'} />
          <SpecTile icon="people-outline" label="Plazas" value={selectedVehicle.seats ? String(selectedVehicle.seats) : 'No indicado'} />
        </View>

        <Card>
          <CardHeader title="Descripción" icon="document-text-outline" />
          <Text style={styles.bodyText}>{selectedVehicle.description}</Text>
        </Card>

        <Card
          onPress={() => handleOpenUserOverview(selectedVehicle.ownerId, ownerName, owner?.avatarUrl ?? null)}
          accessibilityLabel={`Propietario: ${ownerName}. Ver perfil`}
        >
          <View style={styles.ownerRow}>
            <Avatar uri={ownerAvatarUrl} name={ownerName} size={48} />
            <View style={styles.flex1}>
              <Text style={styles.caption}>Propietario</Text>
              <Text style={styles.ownerName}>{ownerName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colorTokens.textMuted} />
          </View>
        </Card>

        <Card>
          <CardHeader title="Ubicación" icon="map-outline" subtitle="Punto aproximado de recogida" />
          <View style={styles.mapWrap}>
            <VehicleLocationMap
              vehicleLocation={{ latitude: selectedVehicle.locationLat, longitude: selectedVehicle.locationLng }}
              userLocation={userPoint}
              height={220}
            />
          </View>
        </Card>
      </View>
    );

    const bookingColumn = (
      <Card style={isWide ? styles.bookingCardWide : undefined}>
        <CardHeader title="Solicitar reserva" icon="key-outline" subtitle="Pagas solo cuando el propietario acepte" />

        <VerificationGate
          missingProfile={!hasRequiredProfileData}
          missingVerification={!canTransact}
          onGoToProfile={onNavigateToTab ? () => onNavigateToTab('profile') : undefined}
          action="solicitar reservas"
        />

        {availabilityWindowsLoading && availabilityWindows.length === 0 ? (
          <View style={styles.skeletonStack}>
            <Skeleton height={48} radius={radiusTokens.input} />
            <Skeleton height={36} width="60%" />
          </View>
        ) : availabilityWindowsError ? (
          <InlineMessage
            tone="error"
            message={availabilityWindowsError}
            actionLabel="Reintentar"
            onAction={() => void fetchAvailabilityWindowsByVehicleId(selectedVehicle.id)}
          />
        ) : !hasFutureWindows ? (
          <InlineMessage
            tone="info"
            title="Sin fechas publicadas"
            message="El propietario todavía no ha abierto disponibilidad para este vehículo."
          />
        ) : (
          <CalendarPicker
            key={calendarKey}
            availabilityWindows={availabilityWindows}
            bookings={vehicleBookings}
            onDateRangeChange={(startDate, startHour, endDate, endHour) => {
              setBookingStartDate(startDate);
              setBookingStartHour(startHour);
              setBookingEndDate(endDate);
              setBookingEndHour(endHour);
              setBookingError(null);
            }}
          />
        )}

        {billableDays !== null ? (
          <View style={styles.priceSummary}>
            <View style={styles.priceRow}>
              <Text style={styles.bodyText}>
                {formatCurrencyEUR(selectedVehicle.pricePerDay)} × {pluralize(billableDays, 'día', 'días')}
              </Text>
              <Text style={styles.priceTotal}>{formatCurrencyEUR(selectedVehicle.pricePerDay * billableDays)}</Text>
            </View>
            <Text style={styles.caption}>Importe estimado. El total final se confirma al crear la solicitud.</Text>
          </View>
        ) : null}

        {bookingError ? <InlineMessage tone="error" message={bookingError} /> : null}

        {bookingSent ? (
          <InlineMessage
            tone="success"
            title="Solicitud enviada"
            message="Te avisaremos en Mis Viajes cuando el propietario responda."
            actionLabel={onNavigateToTab ? 'Ver en Mis Viajes' : undefined}
            onAction={onNavigateToTab ? () => onNavigateToTab('trips') : undefined}
          />
        ) : null}

        <Button
          label="Solicitar reserva"
          icon="paper-plane-outline"
          onPress={() => void handleCreateBooking()}
          loading={bookingSaving}
          disabled={!canTransact || !bookingRange}
          fullWidth
        />

        {upcomingBlocked.length > 0 ? (
          <View style={styles.blockedList}>
            <Text style={styles.chipGroupLabel}>Fechas ya reservadas</Text>
            {upcomingBlocked.slice(0, 4).map((booking) => (
              <View key={booking.id} style={styles.blockedItem}>
                <Ionicons name="lock-closed-outline" size={14} color={colorTokens.textMuted} />
                <Text style={styles.caption}>{formatDateRangeMadrid(booking.startDatetime, booking.endDatetime)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    );

    return (
      <Screen
        topPadding={topPadding}
        bottomPadding={bottomPadding}
        header={
          <ScreenHeader
            title={`${selectedVehicle.brand} ${selectedVehicle.model}`}
            eyebrow="Ficha del vehículo"
            onBack={handleBackToExploreList}
            backLabel={lastListMode === 'map' ? 'Volver al mapa' : 'Volver a explorar'}
          />
        }
      >
        {isWide ? (
          <View style={styles.detailWide}>
            <View style={styles.detailWideMain}>{infoColumn}</View>
            <View style={styles.detailWideSide}>{bookingColumn}</View>
          </View>
        ) : (
          <>
            {infoColumn}
            {bookingColumn}
          </>
        )}
        {overviewModal}
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Mapa                                                                     */
  /* ------------------------------------------------------------------------ */

  if (screenMode === 'map') {
    return (
      <View style={styles.mapRoot}>
        <View style={StyleSheet.absoluteFill}>
          <ExploreVehiclesMap
            vehicles={exploreVehicles.map(
              (vehicle): VehicleMarker => ({
                id: vehicle.id,
                location: { latitude: vehicle.locationLat, longitude: vehicle.locationLng },
                brand: vehicle.brand,
                model: vehicle.model,
                pricePerDay: vehicle.pricePerDay,
                imageUrl: resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null)
              })
            )}
            userLocation={userPoint}
            onVehiclePress={handleOpenVehicleDetails}
            height={Math.max(420, height)}
            infoBottomInset={bottomPadding + (Platform.OS === 'ios' ? 36 : 0)}
          />
        </View>

        <View pointerEvents="box-none" style={[styles.mapOverlay, { paddingTop: topPadding + spacingTokens.sm }]}>
          <View style={[styles.mapControlsCard, { maxWidth: layoutTokens.formMaxWidth }]}>
            {controlsBar(false)}
          </View>
          {vehiclesLoading ? (
            <View style={styles.mapStatus}>
              <ActivityIndicator size="small" color={colorTokens.primary} />
              <Text style={styles.mapStatusText}>Buscando vehículos…</Text>
            </View>
          ) : vehiclesError ? (
            <View style={[styles.mapStatus, styles.mapStatusError]}>
              <Ionicons name="alert-circle" size={16} color={colorTokens.alertText} />
              <Text style={[styles.mapStatusText, { color: colorTokens.alertText }]}>{vehiclesError}</Text>
              <Pressable onPress={() => void handleRefresh()} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.mapRetry}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.mapStatus}>
              <Text style={styles.mapStatusText}>{pluralize(exploreVehicles.length, 'vehículo', 'vehículos')}</Text>
            </View>
          )}
        </View>
        {filtersSheet}
      </View>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Lista                                                                    */
  /* ------------------------------------------------------------------------ */

  const showSkeletons = vehiclesLoading && exploreVehicles.length === 0;

  return (
    <Screen
      topPadding={topPadding}
      bottomPadding={bottomPadding}
      onScroll={handleScroll}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      header={<ScreenHeader title="Explorar" subtitle="Coches de particulares cerca de ti, listos para reservar." />}
      stickyHeader={controlsBar(!showSearchRow)}
    >
      {vehiclesError && exploreVehicles.length > 0 ? (
        <InlineMessage
          tone="error"
          message={vehiclesError}
          actionLabel="Reintentar"
          onAction={() => void handleRefresh()}
        />
      ) : null}

      {!showSkeletons && !vehiclesError && exploreVehicles.length > 0 ? (
        <SectionTitle
          title={activeFilterCount ? 'Resultados' : 'Disponibles'}
          count={exploreVehicles.length}
          actionLabel={activeFilterCount ? 'Quitar filtros' : undefined}
          onAction={activeFilterCount ? () => void handleClearFilters() : undefined}
        />
      ) : null}

      <View style={[styles.grid, { gap: spacingTokens.lg }]}>
        {showSkeletons
          ? Array.from({ length: columns * 2 }).map((_, index) => (
              <VehicleCardSkeleton key={index} style={{ width: cardWidth }} />
            ))
          : listVehicles.map((vehicle) => {
              const owner = ownerById[vehicle.ownerId];
              const ownerName = owner ? getDisplayName(owner.firstName, owner.lastName) : 'Propietario';
              const primaryImageUrl = resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null);
              const fuel = translateFuelType(vehicle.fuelType);
              const transmission = translateTransmission(vehicle.transmission);
              const distance = userPoint
                ? getDistanceKm(userPoint, { latitude: vehicle.locationLat, longitude: vehicle.locationLng })
                : null;

              return (
                <Card
                  key={vehicle.id}
                  padding={0}
                  onPress={() => handleOpenVehicleDetails(vehicle.id)}
                  accessibilityLabel={`${vehicle.brand} ${vehicle.model}, ${formatPriceCompact(vehicle.pricePerDay)} por día`}
                  accessibilityHint="Abre la ficha del vehículo"
                  accessibilityRole="link"
                  style={[styles.vehicleCard, { width: cardWidth }]}
                >
                  <View>
                    <AppImage uri={primaryImageUrl} style={styles.vehicleImage} fallbackLabel="Sin fotos" />
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeValue}>{formatPriceCompact(vehicle.pricePerDay)}</Text>
                      <Text style={styles.priceBadgeUnit}>/día</Text>
                    </View>
                  </View>
                  <View style={styles.vehicleBody}>
                    <Text style={styles.vehicleTitle} numberOfLines={1}>
                      {vehicle.brand} {vehicle.model}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={14} color={colorTokens.textMuted} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {distance !== null ? `${formatDistance(distance)} · ` : ''}
                        {vehicle.locationAddress}
                      </Text>
                    </View>
                    <View style={styles.chipsRow}>
                      <StatusChip label={String(vehicle.year)} compact />
                      {fuel ? <StatusChip label={fuel} compact /> : null}
                      {transmission ? <StatusChip label={transmission} compact /> : null}
                      {vehicle.seats ? <StatusChip label={`${vehicle.seats} plazas`} compact /> : null}
                    </View>
                    <Pressable
                      onPress={() =>
                        handleOpenUserOverview(vehicle.ownerId, ownerName, owner?.avatarUrl ?? null)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Ver perfil de ${ownerName}`}
                      hitSlop={6}
                      style={styles.ownerInline}
                    >
                      <Avatar uri={resolveStoredImageUrl(owner?.avatarUrl ?? null)} name={ownerName} size={26} />
                      <Text style={styles.ownerInlineName} numberOfLines={1}>
                        {ownerName}
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
      </View>

      {!vehiclesLoading && vehiclesError && exploreVehicles.length === 0 ? (
        <ErrorState message={vehiclesError} onRetry={() => void handleRefresh()} retrying={refreshing} />
      ) : null}

      {!vehiclesLoading && !vehiclesError && exploreVehicles.length === 0 ? (
        activeFilterCount ? (
          <EmptyState
            icon="search-outline"
            title="Sin resultados"
            description="No hay vehículos que cumplan estos filtros. Prueba a ampliar el radio o quitar algún filtro."
            actionLabel="Quitar filtros"
            onAction={() => void handleClearFilters()}
          />
        ) : (
          <EmptyState
            icon="car-sport-outline"
            title="Aún no hay vehículos publicados"
            description="Vuelve a intentarlo en un rato o publica el tuyo y empieza a ganar dinero."
            actionLabel={onNavigateToTab ? 'Publicar mi vehículo' : undefined}
            onAction={onNavigateToTab ? () => onNavigateToTab('myVehicles') : undefined}
          />
        )
      ) : null}

      {filtersSheet}
      {overviewModal}
    </Screen>
  );
}

function SpecTile({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.specTile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={colorTokens.accent2} />
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.specValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  bodyText: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  controls: {
    gap: spacingTokens.sm
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  segmented: {
    flex: 1,
    maxWidth: 260,
    marginLeft: 'auto'
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: spacingTokens.lg,
    borderRadius: radiusTokens.pill,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white,
    overflow: 'hidden'
  },
  filterButtonActive: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  filterButtonPressed: {
    opacity: 0.8
  },
  filterButtonText: {
    color: colorTokens.primary,
    ...typographyTokens.captionStrong
  },
  filterButtonTextActive: {
    color: colorTokens.white
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colorTokens.accent2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterBadgeText: {
    color: colorTokens.white,
    ...typographyTokens.overline,
    letterSpacing: 0
  },
  sheetSection: {
    gap: spacingTokens.sm
  },
  sheetHint: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    marginTop: spacingTokens.sm
  },
  unit: {
    color: colorTokens.textMuted,
    ...typographyTokens.bodyStrong
  },
  chipGroup: {
    gap: spacingTokens.sm
  },
  chipGroupLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  chipGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  choiceChip: {
    minHeight: 40,
    paddingHorizontal: spacingTokens.lg,
    borderRadius: radiusTokens.pill,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  choiceChipActive: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  choiceChipPressed: {
    backgroundColor: colorTokens.surfaceMuted
  },
  choiceChipDisabled: {
    opacity: 0.45
  },
  choiceChipText: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  choiceChipTextActive: {
    color: colorTokens.white
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  vehicleCard: {
    overflow: 'hidden',
    gap: 0
  },
  vehicleImage: {
    width: '100%',
    aspectRatio: 16 / 10
  },
  priceBadge: {
    position: 'absolute',
    right: spacingTokens.md,
    bottom: spacingTokens.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: 6,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.white,
    ...shadowTokens.card
  },
  priceBadgeValue: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  priceBadgeUnit: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  vehicleBody: {
    padding: spacingTokens.lg,
    gap: spacingTokens.sm
  },
  vehicleTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  metaText: {
    flex: 1,
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  ownerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacingTokens.sm,
    marginTop: spacingTokens.xs,
    minHeight: 32
  },
  ownerInlineName: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  mapRoot: {
    flex: 1,
    backgroundColor: colorTokens.bgLight
  },
  mapOverlay: {
    paddingHorizontal: spacingTokens.lg,
    gap: spacingTokens.sm,
    alignItems: 'center'
  },
  mapControlsCard: {
    width: '100%',
    padding: spacingTokens.md,
    borderRadius: radiusTokens.lg,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: colorTokens.border,
    ...shadowTokens.raised
  },
  mapStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: 6,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.white,
    ...shadowTokens.card
  },
  mapStatusError: {
    backgroundColor: colorTokens.alertSoft
  },
  mapStatusText: {
    color: colorTokens.primary,
    ...typographyTokens.captionStrong
  },
  mapRetry: {
    color: colorTokens.alertText,
    textDecorationLine: 'underline',
    ...typographyTokens.captionStrong
  },
  detailWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingTokens.xl
  },
  detailWideMain: {
    flex: 3
  },
  detailWideSide: {
    flex: 2
  },
  bookingCardWide: {
    // En escritorio la tarjeta de reserva acompaña al scroll de la ficha.
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: spacingTokens.lg } as object) : null)
  },
  detailColumn: {
    gap: spacingTokens.lg
  },
  detailTitleBlock: {
    gap: spacingTokens.xs
  },
  detailPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2
  },
  detailPriceValue: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  detailPriceUnit: {
    color: colorTokens.textMuted,
    ...typographyTokens.body
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  specTile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 2,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.card,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white
  },
  specValue: {
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  ownerName: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  mapWrap: {
    borderRadius: radiusTokens.input,
    overflow: 'hidden'
  },
  skeletonStack: {
    gap: spacingTokens.sm
  },
  priceSummary: {
    gap: spacingTokens.xs,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  priceTotal: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel,
    fontSize: 17
  },
  blockedList: {
    gap: spacingTokens.xs
  },
  blockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.xs
  }
});
