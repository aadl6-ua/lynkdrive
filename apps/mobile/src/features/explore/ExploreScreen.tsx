import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { httpClient } from '../../api/http';
import { resolveStoredImageUrl } from '../../api/storage';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
import { StatusChip, StatusChipTone } from '../../app/components/ui/StatusChip';
import { styles } from '../../app/styles';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { parseLocaleNumber } from '../../shared/number';
import { useGeocodingSuggestions } from '../../shared/useGeocodingSuggestions';
import { useUserLocation } from '../../shared/useUserLocation';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { canUseTransactionalFlows, hasMinimumProfileData } from '../../shared/verification';
import { UserOverviewModal } from '../../shared/components/UserOverviewModal';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';
import { useVehicleAvailabilityWindowsStore } from '../../store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../../store/useVehicleImagesStore';
import { useVehiclesStore } from '../../store/useVehiclesStore';
import { ExploreVehiclesMap, VehicleLocationMap } from '../maps';
import { CalendarPicker } from './CalendarPicker';
import type { VehicleMarker } from '../maps';

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
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
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

type AvailabilityWindowItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
};

type VehicleImageItem = {
  imageUrl: string;
};

type ActionButtonVariant = 'primary' | 'ghost';
type SelectOption<T extends string> = { label: string; value: T };

type ExploreScreenProps = {
  topPadding?: number;
  bottomPadding?: number;
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

function getBookingStatusTone(status: VehicleBookingItem['status']): StatusChipTone {
  if (status === 'completed' || status === 'paid_confirmed') {
    return 'success';
  }

  if (status === 'pending') {
    return 'warning';
  }

  if (status === 'accepted' || status === 'in_progress') {
    return 'info';
  }

  if (status === 'rejected') {
    return 'danger';
  }

  return 'neutral';
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

function translateFuelType(fuelType: string | null): string {
  const map: Record<string, string> = {
    gasoline: 'Gasolina',
    diesel: 'Diesel',
    electric: 'Eléctrico',
    hybrid: 'Híbrido'
  };
  return map[fuelType?.toLowerCase() ?? ''] ?? 'Combustible no definido';
}

function translateTransmission(transmission: string | null): string {
  const map: Record<string, string> = {
    manual: 'Manual',
    automatic: 'Automática'
  };
  return map[transmission?.toLowerCase() ?? ''] ?? 'Transmisión no definida';
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

function formatDateTimeMadrid(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid'
  }).format(new Date(value));
}

function formatCurrencyEUR(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary'
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        localStyles.actionButton,
        variant === 'primary' ? localStyles.actionButtonPrimary : localStyles.actionButtonGhost,
        disabled ? localStyles.actionButtonDisabled : undefined
      ]}
    >
      <Text
        style={[
          localStyles.actionButtonText,
          variant === 'primary' ? localStyles.actionButtonPrimaryText : localStyles.actionButtonGhostText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SelectDropdown<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (nextValue: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '';

  return (
    <View style={localStyles.dropdownWrap}>
      <Text style={localStyles.inputLabel}>{label}</Text>
      <Pressable style={localStyles.dropdownTrigger} onPress={() => setOpen((current) => !current)}>
        <Text style={localStyles.dropdownValue}>{selectedLabel}</Text>
        <View style={[localStyles.dropdownChevronIcon, open ? localStyles.dropdownChevronIconOpen : undefined]} />
      </Pressable>

      {open ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={localStyles.selectModalBackdrop} onPress={() => setOpen(false)}>
            <Pressable style={localStyles.selectModalCard} onPress={() => undefined}>
              <Text style={localStyles.selectModalTitle}>{label}</Text>
              <View style={localStyles.dropdownPanel}>
                {options.map((option) => {
                  const isActive = option.value === value;

                  return (
                    <Pressable
                      key={option.value || 'empty'}
                      style={[localStyles.dropdownItem, isActive ? localStyles.dropdownItemActive : undefined]}
                      onPress={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <Text style={[localStyles.dropdownItemText, isActive ? localStyles.dropdownItemTextActive : undefined]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

export function ExploreScreen({ topPadding = 0, bottomPadding = 0 }: ExploreScreenProps) {
  const { width, height } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const desktopCardStyle = isDesktopWeb ? localStyles.desktopCard : undefined;
  const mapViewportHeight = Math.max(
    420,
    height - topPadding - bottomPadding - (isDesktopWeb ? 200 : 190)
  );
  const [showStickyFilters, setShowStickyFilters] = useState(true);
  const lastScrollYRef = useRef(0);
  const showStickyFiltersRef = useRef(true);
  const stickyFiltersAnim = useRef(new Animated.Value(1)).current;

  const [screenMode, setScreenMode] = useState<ExploreScreenMode>('list');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [exploreMaxPriceInput, setExploreMaxPriceInput] = useState('');
  const [exploreFuelTypeInput, setExploreFuelTypeInput] = useState<FuelFilter>('');
  const [exploreTransmissionInput, setExploreTransmissionInput] = useState<TransmissionFilter>('');
  const [exploreSeatsInput, setExploreSeatsInput] = useState<SeatsFilter>('');
  const [exploreAddressInput, setExploreAddressInput] = useState('');
  const [exploreSelectedLocation, setExploreSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [exploreRadiusInput, setExploreRadiusInput] = useState('');
  const [exploreFiltersError, setExploreFiltersError] = useState<string | null>(null);

  const [bookingStartDate, setBookingStartDate] = useState<Date | null>(null);
  const [bookingStartHour, setBookingStartHour] = useState(10);
  const [bookingEndDate, setBookingEndDate] = useState<Date | null>(null);
  const [bookingEndHour, setBookingEndHour] = useState(18);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [hasShownLocationPrompt, setHasShownLocationPrompt] = useState(false);
  const [overviewUser, setOverviewUser] = useState<{ id: string; displayName: string; avatarUrl: string | null } | null>(null);

  const [vehicleBookings, setVehicleBookings] = useState<VehicleBookingItem[]>([]);
  const [vehicleBookingsLoading, setVehicleBookingsLoading] = useState(false);
  const [vehicleBookingsError, setVehicleBookingsError] = useState<string | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);

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

  const {
    permissionStatus,
    loading: userLocationLoading,
    error: userLocationError,
    coords: userLocationCoords,
    refreshPermissionStatus,
    requestPermission,
    refreshLocation,
    clearLocationError
  } = useUserLocation();

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
      fetchAvailabilityWindowsByVehicleId(selectedVehicleId),
      refreshPermissionStatus()
    ]);

    // Solicitar permiso de ubicación automáticamente la primera vez
    if (!hasShownLocationPrompt) {
      void handleRequestLocationPermission();
    }
  }, [
    screenMode,
    selectedVehicleId,
    fetchVehicleImagesByVehicleId,
    fetchAvailabilityWindowsByVehicleId,
    refreshPermissionStatus,
    hasShownLocationPrompt
  ]);

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

  useEffect(() => {
    showStickyFiltersRef.current = showStickyFilters;
  }, [showStickyFilters]);

  useEffect(() => {
    Animated.timing(stickyFiltersAnim, {
      toValue: showStickyFilters ? 1 : 0,
      duration: 280,
      useNativeDriver: false
    }).start();
  }, [showStickyFilters, stickyFiltersAnim]);

  useEffect(() => {
    lastScrollYRef.current = 0;
    if (screenMode === 'map' && !showStickyFiltersRef.current) {
      setShowStickyFilters(true);
    }
  }, [screenMode]);

  const handleExploreScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (screenMode === 'map') {
      if (!showStickyFiltersRef.current) {
        setShowStickyFilters(true);
      }
      lastScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
      return;
    }

    const currentY = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = currentY - lastScrollYRef.current;

    if (currentY < 80) {
      if (!showStickyFiltersRef.current) {
        setShowStickyFilters(true);
      }
      lastScrollYRef.current = currentY;
      return;
    }

    if (delta > 8 && showStickyFiltersRef.current) {
      setShowStickyFilters(false);
    } else if (delta < -8 && !showStickyFiltersRef.current) {
      setShowStickyFilters(true);
    }

    lastScrollYRef.current = currentY;
  };

  const stickyWebStyle =
    Platform.OS === 'web'
      ? ({ position: 'sticky', top: isDesktopWeb ? topPadding : 8, zIndex: 30 } as any)
      : undefined;

  const stickyMobileHiddenInset = Platform.OS !== 'web' && !showStickyFilters ? 12 : 0;

  const fuelOptions: Array<SelectOption<FuelFilter>> = [
    { label: 'Todos', value: '' },
    { label: 'Gasolina', value: 'gasoline' },
    { label: 'Diesel', value: 'diesel' },
    { label: 'Eléctrico', value: 'electric' },
    { label: 'Híbrido', value: 'hybrid' }
  ];

  const transmissionOptions: Array<SelectOption<TransmissionFilter>> = [
    { label: 'Todas', value: '' },
    { label: 'Manual', value: 'manual' },
    { label: 'Automática', value: 'automatic' }
  ];

  const seatsOptions: Array<SelectOption<SeatsFilter>> = [
    { label: 'Seleccionar plazas', value: '' },
    { label: '2 plazas', value: '2' },
    { label: '4 plazas', value: '4' },
    { label: '5 plazas', value: '5' },
    { label: '7 plazas', value: '7' }
  ];

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

  const controlsBlock = (
    <>
      <Animated.View
        pointerEvents={showStickyFilters ? 'auto' : 'none'}
        style={[
          localStyles.filterAnimatedWrap,
          {
            opacity: stickyFiltersAnim,
            maxHeight: stickyFiltersAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 560]
            }),
            marginBottom: stickyFiltersAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, spacingTokens.md]
            }),
            transform: [
              {
                translateY: stickyFiltersAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={[styles.card, desktopCardStyle, localStyles.filterBarCard]}>
          <Text style={localStyles.sectionLabel}>Filtros</Text>
          <View style={localStyles.filterBarScrollShell}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.filterBarRow}>
              <View style={localStyles.locationRadioGroup}>
                <View style={localStyles.locationBarItem}>
                  <Text style={localStyles.inputLabel}>Ubicación</Text>
                  <View style={localStyles.locationField}>
                    <View style={localStyles.locationIconWrap}>
                      <View style={localStyles.locationPinDot} />
                      <View style={localStyles.locationPinTail} />
                    </View>
                    <TextInput
                      value={exploreAddressInput}
                      onChangeText={handleExploreAddressChange}
                      style={localStyles.locationInput}
                      placeholder="Busca tu zona..."
                    />
                  </View>
                </View>

                <View style={localStyles.barInputItem}>
                  <Text style={localStyles.inputLabel}>Radio (km)</Text>
                  <TextInput
                    value={exploreRadiusInput}
                    onChangeText={setExploreRadiusInput}
                    style={localStyles.inputField}
                    placeholder="25"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={localStyles.barInputItem}>
                <Text style={localStyles.inputLabel}>Precio máx (€)</Text>
                <TextInput
                  value={exploreMaxPriceInput}
                  onChangeText={setExploreMaxPriceInput}
                  style={localStyles.inputField}
                  placeholder="500"
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={localStyles.barSelectItem}>
                <SelectDropdown
                  label="Combustible"
                  value={exploreFuelTypeInput}
                  options={fuelOptions}
                  onChange={setExploreFuelTypeInput}
                />
              </View>

              <View style={localStyles.barSelectItem}>
                <SelectDropdown
                  label="Transmision"
                  value={exploreTransmissionInput}
                  options={transmissionOptions}
                  onChange={setExploreTransmissionInput}
                />
              </View>

              <View style={localStyles.barSelectItem}>
                <SelectDropdown
                  label="Plazas"
                  value={exploreSeatsInput}
                  options={seatsOptions}
                  onChange={setExploreSeatsInput}
                />
              </View>

              <View style={localStyles.barActionsWrap}>
                <ActionButton label="Aplicar" onPress={() => void handleApplyExploreFilters()} />
                <ActionButton label="Limpiar" onPress={() => void handleClearExploreFilters()} variant="ghost" />
              </View>
            </ScrollView>
          </View>

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

          {exploreFiltersError ? <Text style={styles.error}>{exploreFiltersError}</Text> : null}
        </View>
      </Animated.View>

      <View style={[styles.card, localStyles.viewModeCard]}>
        <Pressable
          onPress={() => setScreenMode('list')}
          style={[localStyles.viewModePill, screenMode === 'list' ? localStyles.viewModePillActive : undefined]}
        >
          <Text style={[localStyles.viewModeText, screenMode === 'list' ? localStyles.viewModeTextActive : undefined]}>Lista</Text>
        </Pressable>
        <Pressable
          onPress={() => setScreenMode('map')}
          style={[localStyles.viewModePill, screenMode === 'map' ? localStyles.viewModePillActive : undefined]}
        >
          <Text style={[localStyles.viewModeText, screenMode === 'map' ? localStyles.viewModeTextActive : undefined]}>Mapa</Text>
        </Pressable>
      </View>
    </>
  );

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
      fuelType: exploreFuelTypeInput || undefined,
      transmission: exploreTransmissionInput || undefined,
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

  const handleOpenVehicleDetails = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setScreenMode('detail');
    setBookingStartDate(null);
    setBookingStartHour(10);
    setBookingEndDate(null);
    setBookingEndHour(18);
    setBookingError(null);
    setBookingMessage(null);
    setVehicleBookings([]);
    setVehicleBookingsError(null);
  };

  const handleBackToExploreList = () => {
    setScreenMode('list');
    setSelectedVehicleId(null);
    setActivePhotoIndex(null);
    setBookingStartDate(null);
    setBookingStartHour(10);
    setBookingEndDate(null);
    setBookingEndHour(18);
    setBookingError(null);
    setBookingMessage(null);
  };

  const handleRequestLocationPermission = async () => {
    clearLocationError();
    if (!hasShownLocationPrompt) {
      setHasShownLocationPrompt(true);
      const nextPermission = await requestPermission();
      if (nextPermission === 'granted') {
        await refreshLocation();
      }
    }
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

    if (!bookingStartDate || !bookingEndDate) {
      setBookingError('Selecciona fecha y hora de inicio y fin en el calendario.');
      setBookingMessage(null);
      return;
    }

    // Construcción de datetime ISO con las fechas y horas seleccionadas
    const startDateTime = new Date(bookingStartDate);
    startDateTime.setHours(bookingStartHour, 0, 0, 0);
    const startISO = startDateTime.toISOString();

    const endDateTime = new Date(bookingEndDate);
    endDateTime.setHours(bookingEndHour, 0, 0, 0);
    const endISO = endDateTime.toISOString();

    setBookingSaving(true);
    setBookingError(null);
    setBookingMessage(null);

    try {
      await httpClient.post('/bookings', {
        vehicleId: selectedVehicleId,
        startDatetime: startISO,
        endDatetime: endISO
      });

      const bookingsResponse = await httpClient.get<VehicleBookingItem[]>(`/bookings/vehicle/${selectedVehicleId}`);
      setVehicleBookings(bookingsResponse.data);

      setBookingMessage(null);
      setBookingStartDate(null);
      setBookingStartHour(10);
      setBookingEndDate(null);
      setBookingEndHour(18);
    } catch (error: unknown) {
      const apiMessage = getApiErrorMessage(error);
      setBookingError(
        apiMessage ??
          'No se pudo crear la reserva. Revisa disponibilidad y que no exista solape con otra reserva.'
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

  if (screenMode === 'detail' && selectedVehicle) {
    const selectedOwner = ownerById[selectedVehicle.ownerId];
    const selectedOwnerAvatarUrl = resolveStoredImageUrl(selectedOwner?.avatarUrl ?? null);

    return (
      <ScrollView
        style={localStyles.exploreScroll}
        contentContainerStyle={[
          localStyles.exploreScrollContent,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding + spacingTokens.md,
            paddingHorizontal: spacingTokens.lg
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title={`${selectedVehicle.brand} ${selectedVehicle.model}`}
          subtitle="Ficha completa del vehiculo para decidir tu reserva."
          centered={isDesktopWeb}
        />

        {!isDesktopWeb ? (
          <View style={localStyles.inlineActions}>
            <ActionButton label="Volver a explorar" onPress={handleBackToExploreList} variant="ghost" />
          </View>
        ) : null}

        <View style={[styles.card, desktopCardStyle]}>
          <Pressable
            style={localStyles.ownerCard}
            onPress={() =>
              handleOpenUserOverview(
                selectedVehicle.ownerId,
                getUserFullName(selectedOwner),
                selectedOwner?.avatarUrl ?? null
              )
            }
          >
            {selectedOwnerAvatarUrl ? (
              <Image source={{ uri: selectedOwnerAvatarUrl }} style={localStyles.ownerAvatar} resizeMode="cover" />
            ) : (
              <View style={localStyles.ownerAvatarFallback}>
                <Text style={localStyles.ownerAvatarFallbackText}>{getInitials(selectedOwner)}</Text>
              </View>
            )}
            <View style={localStyles.ownerInfo}>
              <Text style={localStyles.ownerLabel}>Propietario</Text>
              <Text style={localStyles.ownerName}>{getUserFullName(selectedOwner)}</Text>
            </View>
          </Pressable>

          {vehicleImagesLoading || availabilityWindowsLoading ? <ActivityIndicator size="small" /> : null}
          {vehicleImagesError ? <Text style={styles.error}>{vehicleImagesError}</Text> : null}
          {availabilityWindowsError ? <Text style={styles.error}>{availabilityWindowsError}</Text> : null}
          {ownerLookupError ? <Text style={styles.error}>{ownerLookupError}</Text> : null}

          <Text style={localStyles.sectionLabel}>Fotos</Text>
          {selectedVehicleImageUrls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.galleryRow}>
              {selectedVehicleImageUrls.map((imageUrl: string, index: number) => (
                <Pressable key={`${selectedVehicle.id}-${index}`} onPress={() => setActivePhotoIndex(index)}>
                  <Image source={{ uri: imageUrl }} style={localStyles.galleryImage} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={localStyles.imagePlaceholder}>
              <Text style={localStyles.imagePlaceholderText}>Este vehiculo aun no tiene fotos publicadas.</Text>
            </View>
          )}

          <Text style={localStyles.sectionLabel}>Detalles</Text>
          <View style={localStyles.detailGrid}>
            <StatusChip label={`Año ${selectedVehicle.year}`} tone="neutral" compact />
            <StatusChip label={formatCurrencyEUR(selectedVehicle.pricePerDay)} tone="info" compact />
            <StatusChip label={translateFuelType(selectedVehicle.fuelType)} tone="neutral" compact />
            <StatusChip label={translateTransmission(selectedVehicle.transmission)} tone="neutral" compact />
            {selectedVehicle.seats ? <StatusChip label={`${selectedVehicle.seats} plazas`} tone="neutral" compact /> : null}
          </View>
          <Text style={localStyles.locationText}>{selectedVehicle.locationAddress}</Text>
          <Text style={localStyles.descriptionText}>{selectedVehicle.description}</Text>

          <Text style={localStyles.sectionLabel}>Mapa</Text>
          <VehicleLocationMap
            vehicleLocation={{
              latitude: selectedVehicle.locationLat,
              longitude: selectedVehicle.locationLng
            }}
            userLocation={
              userLocationCoords
                ? {
                    latitude: userLocationCoords.latitude,
                    longitude: userLocationCoords.longitude
                  }
                : null
            }
            height={220}
          />

          <Text style={localStyles.sectionLabel}>Solicitar reserva</Text>
          <View style={localStyles.bookingCard}>
            <View style={localStyles.inlineActions}>
              <StatusChip label={hasRequiredProfileData ? 'Perfil minimo: OK' : 'Perfil minimo: pendiente'} tone={hasRequiredProfileData ? 'success' : 'warning'} compact />
              <StatusChip label={canTransact ? 'Documentacion: verificada' : 'Documentacion: pendiente'} tone={canTransact ? 'success' : 'warning'} compact />
            </View>

            {selectedVehicle && vehicleBookings.length >= 0 ? (
              <CalendarPicker
                availabilityWindows={typedAvailabilityWindows.map((w) => ({
                  id: w.id,
                  startDatetime: w.startDatetime,
                  endDatetime: w.endDatetime
                }))}
                bookings={vehicleBookings}
                onDateRangeChange={(startDate: Date | null, startHour: number, endDate: Date | null, endHour: number) => {
                  setBookingStartDate(startDate);
                  setBookingStartHour(startHour);
                  setBookingEndDate(endDate);
                  setBookingEndHour(endHour);
                }}
              />
            ) : null}

            <View style={localStyles.inlineActions}>
              <ActionButton
                label={bookingSaving ? 'Solicitando...' : 'Solicitar reserva'}
                onPress={() => void handleCreateBooking()}
                disabled={bookingSaving || !canTransact || !bookingStartDate || !bookingEndDate}
              />
            </View>

            {bookingError ? <Text style={styles.error}>{bookingError}</Text> : null}
          </View>

          {isDesktopWeb ? (
            <View style={[localStyles.inlineActions, localStyles.inlineActionsCentered]}>
              <ActionButton label="Volver a explorar" onPress={handleBackToExploreList} variant="ghost" />
            </View>
          ) : null}
        </View>

        <Modal visible={activePhotoIndex !== null} animationType="fade" transparent>
          <View style={localStyles.modalBackdrop}>
            <View style={localStyles.modalCard}>
              <View style={localStyles.modalTopRow}>
                <Text style={localStyles.modalTitle}>Galeria</Text>
                <Pressable onPress={() => setActivePhotoIndex(null)} style={localStyles.modalCloseButton}>
                  <Text style={localStyles.modalCloseText}>Cerrar</Text>
                </Pressable>
              </View>

              {activePhotoIndex !== null && selectedVehicleImageUrls[activePhotoIndex] ? (
                <Image
                  source={{ uri: selectedVehicleImageUrls[activePhotoIndex] }}
                  style={localStyles.modalImage}
                  resizeMode="contain"
                />
              ) : null}

              <View style={localStyles.modalActions}>
                <ActionButton
                  label="Anterior"
                  variant="ghost"
                  onPress={() => setActivePhotoIndex((current) => (current === null || current <= 0 ? 0 : current - 1))}
                  disabled={activePhotoIndex === null || activePhotoIndex <= 0}
                />
                <ActionButton
                  label="Siguiente"
                  variant="ghost"
                  onPress={() =>
                    setActivePhotoIndex((current) => {
                      if (current === null) {
                        return 0;
                      }

                      return Math.min(selectedVehicleImageUrls.length - 1, current + 1);
                    })
                  }
                  disabled={activePhotoIndex === null || activePhotoIndex >= selectedVehicleImageUrls.length - 1}
                />
              </View>
            </View>
          </View>
        </Modal>

        <UserOverviewModal
          visible={!!overviewUser}
          userId={overviewUser?.id ?? null}
          displayName={overviewUser?.displayName ?? 'Usuario'}
          avatarUrl={overviewUser?.avatarUrl ?? null}
          onClose={() => setOverviewUser(null)}
        />
      </ScrollView>
    );
  }

  if (screenMode === 'map') {
    const fullMapHeight = Math.max(420, height);

    return (
      <View style={localStyles.mapLayerRoot}>
        <View style={localStyles.mapBackgroundLayer}>
          <ExploreVehiclesMap
            vehicles={exploreVehicles.map((vehicle: ExploreVehicle): VehicleMarker => ({
              id: vehicle.id,
              location: {
                latitude: vehicle.locationLat,
                longitude: vehicle.locationLng
              },
              brand: vehicle.brand,
              model: vehicle.model,
              pricePerDay: vehicle.pricePerDay,
              imageUrl: resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null)
            }))}
            userLocation={
              permissionStatus === 'granted' && userLocationCoords
                ? { latitude: userLocationCoords.latitude, longitude: userLocationCoords.longitude }
                : null
            }
            onVehiclePress={(vehicleId: string) => handleOpenVehicleDetails(vehicleId)}
            height={fullMapHeight}
            infoBottomInset={bottomPadding + (Platform.OS === 'ios' ? 36 : 0)}
          />
        </View>

        <View
          pointerEvents="box-none"
          style={[
            localStyles.mapOverlayLayer,
            {
              paddingTop: topPadding + spacingTokens.sm,
              paddingBottom: bottomPadding + spacingTokens.sm,
              paddingHorizontal: spacingTokens.lg
            }
          ]}
        >
          <View pointerEvents="auto" style={localStyles.mapOverlayContent}>
            <View style={localStyles.mapControlsStack}>{controlsBlock}</View>
            {vehiclesLoading ? <ActivityIndicator size="small" /> : null}
            {vehiclesError ? <Text style={[styles.error, localStyles.mapStatusErrorText]}>{vehiclesError}</Text> : null}
            {ownerLookupError ? <Text style={[styles.error, localStyles.mapStatusErrorText]}>{ownerLookupError}</Text> : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={localStyles.exploreScroll}
      contentContainerStyle={[
        localStyles.exploreScrollContent,
        {
          paddingTop: topPadding,
          paddingBottom: bottomPadding + spacingTokens.md,
          paddingHorizontal: spacingTokens.lg
        }
      ]}
      onScroll={handleExploreScroll}
      scrollEventThrottle={16}
      stickyHeaderIndices={Platform.OS === 'web' ? undefined : [1]}
    >
      <SectionHeader
        title="Explorar"
        subtitle="Descubre vehiculos cercanos y filtra en segundos."
        centered={isDesktopWeb}
      />

      <View
        style={[
          localStyles.stickyControlsShell,
          stickyWebStyle,
          stickyMobileHiddenInset ? { paddingTop: stickyMobileHiddenInset } : undefined
        ]}
      >
        {controlsBlock}
      </View>

      {vehiclesLoading ? <ActivityIndicator size="small" /> : null}
      {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
      {ownerLookupError ? <Text style={styles.error}>{ownerLookupError}</Text> : null}

      <View style={[localStyles.vehicleGrid, isDesktopWeb ? localStyles.vehicleGridDesktop : undefined]}>
          {exploreVehicles.map((vehicle: ExploreVehicle) => {
            const owner = ownerById[vehicle.ownerId];
            const ownerAvatarUrl = resolveStoredImageUrl(owner?.avatarUrl ?? null);
            const primaryImageUrl = resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null);

            return (
              <Pressable
                key={vehicle.id}
                style={[styles.card, isDesktopWeb ? localStyles.desktopListCard : undefined]}
                onPress={() => handleOpenVehicleDetails(vehicle.id)}
              >
                {primaryImageUrl ? (
                  <Image
                    source={{ uri: primaryImageUrl }}
                    style={[localStyles.vehicleHeroImage, isDesktopWeb ? localStyles.vehicleHeroImageDesktop : undefined]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[localStyles.imagePlaceholder, isDesktopWeb ? localStyles.vehicleHeroImageDesktop : undefined]}>
                    <Text style={localStyles.imagePlaceholderText}>Sin imagen</Text>
                  </View>
                )}

                <View style={localStyles.vehicleTitleRow}>
                  <Text style={localStyles.vehicleTitle}>{vehicle.brand} {vehicle.model}</Text>
                  <Text style={localStyles.vehiclePrice}>{formatCurrencyEUR(vehicle.pricePerDay)}</Text>
                </View>

                <Text style={localStyles.vehicleLocation}>{vehicle.locationAddress}</Text>

                <View style={localStyles.vehicleMetaChips}>
                  <StatusChip label={`Año ${vehicle.year}`} tone="neutral" compact />
                  {vehicle.fuelType ? <StatusChip label={translateFuelType(vehicle.fuelType)} tone="neutral" compact /> : null}
                  {vehicle.transmission ? <StatusChip label={translateTransmission(vehicle.transmission)} tone="neutral" compact /> : null}
                  {vehicle.seats ? <StatusChip label={`${vehicle.seats} plazas`} tone="neutral" compact /> : null}
                </View>

                <View style={localStyles.ownerInlineRow}>
                  <Pressable
                    style={localStyles.ownerInlineTap}
                    onPress={(event) => {
                      event.stopPropagation();
                      handleOpenUserOverview(vehicle.ownerId, getUserFullName(owner), owner?.avatarUrl ?? null);
                    }}
                  >
                    {ownerAvatarUrl ? (
                      <Image source={{ uri: ownerAvatarUrl }} style={localStyles.ownerAvatarInline} resizeMode="cover" />
                    ) : (
                      <View style={localStyles.ownerAvatarInlineFallback}>
                        <Text style={localStyles.ownerAvatarInlineFallbackText}>{getInitials(owner)}</Text>
                      </View>
                    )}
                    <Text style={localStyles.ownerInlineName}>{getUserFullName(owner)}</Text>
                  </Pressable>
                </View>

                <Text style={styles.linkHint}>Toca para ver ficha completa, galeria y disponibilidad.</Text>
              </Pressable>
            );
          })}
      </View>

      {!vehiclesLoading && !vehiclesError && exploreVehicles.length === 0 ? (
        <EmptyState title="Sin resultados" description="No hay vehiculos disponibles con estos filtros." />
      ) : null}

      <UserOverviewModal
        visible={!!overviewUser}
        userId={overviewUser?.id ?? null}
        displayName={overviewUser?.displayName ?? 'Usuario'}
        avatarUrl={overviewUser?.avatarUrl ?? null}
        onClose={() => setOverviewUser(null)}
      />
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  exploreScroll: {
    flex: 1
  },
  exploreScrollContent: {
    gap: spacingTokens.md
  },
  desktopCard: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center'
  },
  sectionLabel: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  filterBarCard: {
    overflow: 'visible',
    borderRadius: 18,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0
  },
  stickyControlsShell: {
    gap: 0,
    backgroundColor: 'transparent',
    paddingBottom: spacingTokens.xs,
    zIndex: 20
  },
  filterAnimatedWrap: {
    overflow: 'hidden'
  },
  filterBarScrollShell: {
    position: 'relative'
  },
  filterBarRow: {
    gap: spacingTokens.sm,
    paddingTop: spacingTokens.xs + 1,
    paddingBottom: spacingTokens.xs,
    alignItems: 'flex-end',
    paddingHorizontal: 2
  },
  filterEdgeFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 22
  },
  filterEdgeFadeLeft: {
    left: 0
  },
  filterEdgeFadeRight: {
    right: 0
  },
  locationRadioGroup: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    alignItems: 'flex-end',
    flex: 1
  },
  locationBarItem: {
    flex: 1,
    minWidth: 200,
    maxWidth: 280,
    gap: spacingTokens.xs
  },
  locationField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    backgroundColor: colorTokens.white,
    paddingHorizontal: spacingTokens.md,
    minHeight: 50
  },
  barInputItem: {
    minWidth: 120,
    maxWidth: 150,
    gap: spacingTokens.xs
  },
  barSelectItem: {
    minWidth: 165,
    maxWidth: 180
  },
  barActionsWrap: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    paddingBottom: 1
  },
  viewModeCard: {
    flexDirection: 'row',
    gap: spacingTokens.xs,
    padding: spacingTokens.xs,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.white,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0
  },
  viewModePill: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radiusTokens.pill,
    backgroundColor: 'transparent',
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs
  },
  viewModePillActive: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  viewModeText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  },
  viewModeTextActive: {
    color: colorTokens.white,
    fontWeight: '700'
  },
  mapLayerRoot: {
    flex: 1,
    backgroundColor: colorTokens.bgLight
  },
  mapBackgroundLayer: {
    ...StyleSheet.absoluteFillObject
  },
  mapOverlayLayer: {
    flex: 1
  },
  mapOverlayContent: {
    gap: spacingTokens.md
  },
  mapControlsStack: {
    gap: spacingTokens.xs
  },
  mapStatusText: {
    color: colorTokens.white,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  mapStatusErrorText: {
    color: colorTokens.alert,
    backgroundColor: 'transparent',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  inlineActionsCentered: {
    justifyContent: 'center'
  },
  actionButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionButtonPrimary: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  actionButtonGhost: {
    backgroundColor: colorTokens.white,
    borderColor: colorTokens.border
  },
  actionButtonText: {
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  actionButtonPrimaryText: {
    color: colorTokens.white
  },
  actionButtonGhostText: {
    color: colorTokens.secondary
  },
  actionButtonDisabled: {
    opacity: 0.45
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    backgroundColor: colorTokens.white,
    paddingHorizontal: spacingTokens.md,
    minHeight: 50
  },
  locationIconWrap: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  locationPinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colorTokens.secondary,
    backgroundColor: colorTokens.white
  },
  locationPinTail: {
    width: 2,
    height: 7,
    marginTop: 1,
    borderRadius: 1,
    backgroundColor: colorTokens.secondary
  },
  locationInput: {
    flex: 1,
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  inputLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  inputField: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    backgroundColor: colorTokens.white,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    minHeight: 50,
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  dropdownWrap: {
    gap: spacingTokens.xs,
    position: 'relative'
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 14,
    backgroundColor: colorTokens.white,
    paddingHorizontal: spacingTokens.md,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dropdownValue: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  dropdownChevronIcon: {
    width: 8,
    height: 8,
    borderRightWidth: 1.6,
    borderBottomWidth: 1.6,
    borderColor: colorTokens.secondary,
    transform: [{ rotate: '45deg' }],
    marginRight: 2
  },
  dropdownChevronIconOpen: {
    transform: [{ rotate: '-135deg' }],
    marginTop: 4
  },
  selectModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,15,20,0.2)',
    justifyContent: 'center',
    paddingHorizontal: spacingTokens.lg
  },
  selectModalCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.md,
    gap: spacingTokens.sm,
    maxHeight: 420
  },
  selectModalTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  dropdownPanel: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    overflow: 'hidden',
    backgroundColor: colorTokens.white
  },
  dropdownItem: {
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border
  },
  dropdownItemActive: {
    backgroundColor: colorTokens.bgLight
  },
  dropdownItemText: {
    color: colorTokens.textMain,
    ...typographyTokens.caption
  },
  dropdownItemTextActive: {
    color: colorTokens.primary,
    fontWeight: '700'
  },
  suggestionsList: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    overflow: 'hidden'
  },
  suggestionItem: {
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border
  },
  suggestionLabel: {
    color: colorTokens.primary,
    ...typographyTokens.body
  },
  vehicleHeroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  vehicleHeroImageDesktop: {
    height: 150
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight,
    borderWidth: 1,
    borderColor: colorTokens.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingTokens.md
  },
  imagePlaceholderText: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    textAlign: 'center'
  },
  vehicleGrid: {
    width: '100%',
    gap: spacingTokens.md
  },
  vehicleGridDesktop: {
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  desktopListCard: {
    width: '31%',
    minWidth: 250,
    maxWidth: 320
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  vehicleTitle: {
    flex: 1,
    color: colorTokens.primary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700'
  },
  vehiclePrice: {
    color: colorTokens.secondary,
    ...typographyTokens.sectionLabel
  },
  vehicleLocation: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  vehicleMetaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.xs
  },
  ownerInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  ownerInlineTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  ownerAvatarInline: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  ownerAvatarInlineFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ownerAvatarInlineFallbackText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  },
  ownerInlineName: {
    color: colorTokens.primary,
    ...typographyTokens.caption
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    padding: spacingTokens.md,
    backgroundColor: colorTokens.white
  },
  ownerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  ownerAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ownerAvatarFallbackText: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  ownerInfo: {
    flex: 1,
    gap: 2
  },
  ownerLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  ownerName: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  galleryRow: {
    gap: spacingTokens.sm,
    paddingVertical: spacingTokens.xs
  },
  galleryImage: {
    width: 260,
    height: 170,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.xs
  },
  locationText: {
    color: colorTokens.secondary,
    ...typographyTokens.body
  },
  descriptionText: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    padding: spacingTokens.md,
    backgroundColor: colorTokens.white,
    gap: spacingTokens.sm
  },
  dataBlockList: {
    gap: spacingTokens.sm
  },
  dataBlockItem: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    padding: spacingTokens.md,
    gap: spacingTokens.xs,
    backgroundColor: colorTokens.white
  },
  dataBlockLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  dataBlockValue: {
    color: colorTokens.primary,
    ...typographyTokens.body
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,15,20,0.86)',
    padding: spacingTokens.lg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCard: {
    width: '100%',
    maxWidth: 940,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.bgDark,
    padding: spacingTokens.lg,
    gap: spacingTokens.md
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalTitle: {
    color: colorTokens.white,
    ...typographyTokens.sectionLabel
  },
  modalCloseButton: {
    borderWidth: 1,
    borderColor: colorTokens.white,
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs
  },
  modalCloseText: {
    color: colorTokens.white,
    ...typographyTokens.caption
  },
  modalImage: {
    width: '100%',
    height: 420,
    borderRadius: radiusTokens.input,
    backgroundColor: '#000000'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacingTokens.sm
  }
});