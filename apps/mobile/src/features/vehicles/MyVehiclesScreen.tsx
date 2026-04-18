import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  useWindowDimensions
} from 'react-native';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { uploadImageToApi } from '../../api/uploads';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
import { styles } from '../../app/styles';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { parseLocaleNumber } from '../../shared/number';
import { useGeocodingSuggestions } from '../../shared/useGeocodingSuggestions';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { useAuthStore } from '../../store/useAuthStore';
import { useVehicleAvailabilityWindowsStore } from '../../store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../../store/useVehicleImagesStore';
import { useVehiclesStore } from '../../store/useVehiclesStore';
import { CalendarPicker } from '../explore/CalendarPicker';

type MyVehiclesScreenMode = 'list' | 'create' | 'edit' | 'images' | 'availability';

type AvailabilityDateRange = {
  startDate: Date | null;
  startHour: number;
  endDate: Date | null;
  endHour: number;
};

type MyVehiclesScreenProps = {
  topPadding?: number;
  bottomPadding?: number;
};

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type SelectOption = {
  label: string;
  value: string;
};

const FUEL_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Gasolina', value: 'gasoline' },
  { label: 'Diesel', value: 'diesel' },
  { label: 'Electrico', value: 'electric' },
  { label: 'Hibrido', value: 'hybrid' }
];

const TRANSMISSION_OPTIONS: SelectOption[] = [
  { label: 'Manual', value: 'manual' },
  { label: 'Automatica', value: 'automatic' }
];

const SEATS_OPTIONS: SelectOption[] = [
  { label: 'No especificado', value: '' },
  { label: '2 plazas', value: '2' },
  { label: '3 plazas', value: '3' },
  { label: '4 plazas', value: '4' },
  { label: '5 plazas', value: '5' },
  { label: '6 plazas', value: '6' },
  { label: '7 plazas', value: '7' },
  { label: '8 plazas', value: '8' },
  { label: '9 plazas', value: '9' }
];

function formatDateTime(value: string): string {
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

function parseDateFromIso(value: string): Date | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function buildAvailabilitySelectionFromIso(startIso: string, endIso: string): AvailabilityDateRange {
  const startDate = parseDateFromIso(startIso);
  const endDate = parseDateFromIso(endIso);

  return {
    startDate,
    startHour: startDate?.getHours() ?? 10,
    endDate,
    endHour: endDate?.getHours() ?? 18
  };
}

function emptyAvailabilitySelection(): AvailabilityDateRange {
  return {
    startDate: null,
    startHour: 10,
    endDate: null,
    endHour: 18
  };
}

function buildIsoFromSelection(date: Date | null, hour: number): string {
  if (!date) {
    return '';
  }

  const nextDate = new Date(date);
  nextDate.setHours(hour, 0, 0, 0);
  return nextDate.toISOString();
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
  variant?: ButtonVariant;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        localStyles.actionButton,
        variant === 'primary'
          ? localStyles.actionButtonPrimary
          : variant === 'danger'
            ? localStyles.actionButtonDanger
            : localStyles.actionButtonGhost,
        disabled ? localStyles.actionButtonDisabled : undefined
      ]}
    >
      <Text
        style={[
          localStyles.actionButtonText,
          variant === 'ghost' ? localStyles.actionButtonGhostText : undefined,
          variant === 'danger' ? localStyles.actionButtonDangerText : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}


function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'sentences',
  multiline = false
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
}) {
  return (
    <View style={localStyles.fieldWrap}>
      <Text style={localStyles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[styles.input, multiline ? localStyles.multilineInput : null]}
      />
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <View style={localStyles.fieldWrap}>
      <Text style={localStyles.fieldLabel}>{label}</Text>
      <View>
        <Pressable style={localStyles.selectTrigger} onPress={() => setOpen((prev) => !prev)}>
          <Text style={selectedLabel ? localStyles.selectValueText : localStyles.selectPlaceholderText}>
            {selectedLabel ?? placeholder}
          </Text>
          <Text style={localStyles.selectChevron}>{open ? '▲' : '▼'}</Text>
        </Pressable>

        {open ? (
          <View style={localStyles.selectOptions}>
            {options.map((option, index) => (
              <Pressable
                key={option.value || `option-${index}`}
                style={[
                  localStyles.selectOptionItem,
                  index === options.length - 1 ? localStyles.selectOptionItemLast : undefined
                ]}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Text style={localStyles.suggestionLabel}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function MyVehiclesScreen({ topPadding = 0, bottomPadding = 0 }: MyVehiclesScreenProps) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const desktopCardStyle = isDesktopWeb ? localStyles.desktopCard : undefined;
  const fabBottomOffset =
    Platform.OS === 'web'
      ? spacingTokens.lg
      : Math.max(spacingTokens.sm, bottomPadding - spacingTokens.md);

  const [screenMode, setScreenMode] = useState<MyVehiclesScreenMode>('list');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleImageUploading, setVehicleImageUploading] = useState(false);
  const [editingAvailabilityWindowId, setEditingAvailabilityWindowId] = useState<string | null>(null);

  const [vehicleBrandInput, setVehicleBrandInput] = useState('');
  const [vehicleModelInput, setVehicleModelInput] = useState('');
  const [vehicleYearInput, setVehicleYearInput] = useState('');
  const [vehicleLicensePlateInput, setVehicleLicensePlateInput] = useState('');
  const [vehicleDescriptionInput, setVehicleDescriptionInput] = useState('');
  const [vehiclePricePerDayInput, setVehiclePricePerDayInput] = useState('');
  const [vehicleAddressInput, setVehicleAddressInput] = useState('');
  const [vehicleSelectedLocation, setVehicleSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [createVehicleFormError, setCreateVehicleFormError] = useState<string | null>(null);
  const [vehicleFuelTypeInput, setVehicleFuelTypeInput] = useState('');
  const [vehicleTransmissionInput, setVehicleTransmissionInput] = useState('');
  const [vehicleSeatsInput, setVehicleSeatsInput] = useState('');

  const [editVehicleBrandInput, setEditVehicleBrandInput] = useState('');
  const [editVehicleModelInput, setEditVehicleModelInput] = useState('');
  const [editVehicleYearInput, setEditVehicleYearInput] = useState('');
  const [editVehicleLicensePlateInput, setEditVehicleLicensePlateInput] = useState('');
  const [editVehicleDescriptionInput, setEditVehicleDescriptionInput] = useState('');
  const [editVehiclePricePerDayInput, setEditVehiclePricePerDayInput] = useState('');
  const [editVehicleAddressInput, setEditVehicleAddressInput] = useState('');
  const [editVehicleSelectedLocation, setEditVehicleSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [editVehicleFormError, setEditVehicleFormError] = useState<string | null>(null);
  const [editVehicleFuelTypeInput, setEditVehicleFuelTypeInput] = useState('');
  const [editVehicleTransmissionInput, setEditVehicleTransmissionInput] = useState('');
  const [editVehicleSeatsInput, setEditVehicleSeatsInput] = useState('');


  const [availabilityStartInput, setAvailabilityStartInput] = useState('');
  const [availabilityEndInput, setAvailabilityEndInput] = useState('');
  const initialAvailabilitySelection = useMemo(
    () =>
      availabilityStartInput.trim() && availabilityEndInput.trim()
        ? buildAvailabilitySelectionFromIso(availabilityStartInput, availabilityEndInput)
        : emptyAvailabilitySelection(),
    [availabilityStartInput, availabilityEndInput]
  );

  const resetCreateVehicleForm = () => {
    setVehicleBrandInput('');
    setVehicleModelInput('');
    setVehicleYearInput('');
    setVehicleLicensePlateInput('');
    setVehicleDescriptionInput('');
    setVehiclePricePerDayInput('');
    setVehicleAddressInput('');
    setVehicleSelectedLocation(null);
    setCreateVehicleFormError(null);
    setVehicleFuelTypeInput('');
    setVehicleTransmissionInput('');
    setVehicleSeatsInput('');
  };

  const resetAvailabilityForm = () => {
    setEditingAvailabilityWindowId(null);
    setAvailabilityStartInput('');
    setAvailabilityEndInput('');
  };

  const {
    items: myVehicles,
    loading: vehiclesLoading,
    creating: vehiclesCreating,
    error: vehiclesError,
    mutationMessage: vehiclesMutationMessage,
    fetchMyVehicles,
    createVehicle,
    updateVehicleById,
    deleteVehicleById
  } = useVehiclesStore();
  const { userId: authUserId } = useAuthStore();

  const {
    items: vehicleImages,
    loading: vehicleImagesLoading,
    saving: vehicleImagesSaving,
    error: vehicleImagesError,
    mutationMessage: vehicleImagesMutationMessage,
    fetchByVehicleId: fetchVehicleImagesByVehicleId,
    createForVehicle: createVehicleImageForVehicle,
    deleteById: deleteVehicleImageById,
    updateById: updateVehicleImageById
  } = useVehicleImagesStore();

  const {
    items: availabilityWindows,
    loading: availabilityWindowsLoading,
    saving: availabilityWindowsSaving,
    error: availabilityWindowsError,
    mutationMessage: availabilityWindowsMutationMessage,
    fetchByVehicleId: fetchAvailabilityWindowsByVehicleId,
    createForVehicle: createAvailabilityWindowForVehicle,
    updateById: updateAvailabilityWindowById,
    deleteById: deleteAvailabilityWindowById
  } = useVehicleAvailabilityWindowsStore();

  const editingVehicle = useMemo(
    () => myVehicles.find((vehicle) => vehicle.id === editingVehicleId) ?? null,
    [myVehicles, editingVehicleId]
  );
  const imageByVehicleId = useVehiclePrimaryImages(myVehicles.map((vehicle) => vehicle.id));
  const {
    suggestions: vehicleAddressSuggestions,
    loading: vehicleAddressLoading,
    error: vehicleAddressError
  } = useGeocodingSuggestions(vehicleAddressInput);
  const {
    suggestions: editVehicleAddressSuggestions,
    loading: editVehicleAddressLoading,
    error: editVehicleAddressError
  } = useGeocodingSuggestions(editVehicleAddressInput);

  useEffect(() => {
    if (!authUserId) {
      return;
    }

    void fetchMyVehicles();
  }, [authUserId, fetchMyVehicles]);

  const handleCreateVehicle = async () => {
    const parsedYear = parseLocaleNumber(vehicleYearInput);
    const parsedPrice = parseLocaleNumber(vehiclePricePerDayInput);
    const parsedSeats = parseLocaleNumber(vehicleSeatsInput);

    if (
      !vehicleBrandInput.trim() ||
      !vehicleModelInput.trim() ||
      !vehicleLicensePlateInput.trim() ||
      !vehicleDescriptionInput.trim() ||
      !vehicleAddressInput.trim() ||
      Number.isNaN(parsedYear) ||
      Number.isNaN(parsedPrice)
    ) {
      setCreateVehicleFormError('Completa todos los campos obligatorios antes de crear el vehiculo.');
      return;
    }

    if (!vehicleSelectedLocation) {
      setCreateVehicleFormError('Selecciona una direccion sugerida para obtener coordenadas validas.');
      return;
    }

    setCreateVehicleFormError(null);

    await createVehicle({
      brand: vehicleBrandInput.trim(),
      model: vehicleModelInput.trim(),
      year: parsedYear,
      licensePlate: vehicleLicensePlateInput.trim().toUpperCase(),
      description: vehicleDescriptionInput.trim(),
      pricePerDay: parsedPrice,
      locationLat: vehicleSelectedLocation.lat,
      locationLng: vehicleSelectedLocation.lng,
      locationAddress: vehicleAddressInput.trim(),
      fuelType: ['gasoline', 'diesel', 'electric', 'hybrid'].includes(vehicleFuelTypeInput)
        ? (vehicleFuelTypeInput as 'gasoline' | 'diesel' | 'electric' | 'hybrid')
        : null,
      transmission: ['manual', 'automatic'].includes(vehicleTransmissionInput)
        ? (vehicleTransmissionInput as 'manual' | 'automatic')
        : null,
      seats: Number.isNaN(parsedSeats) ? null : parsedSeats,
      status: 'active'
    });

    await fetchMyVehicles();
    resetCreateVehicleForm();
    setScreenMode('list');
  };

  const handleCreateVehicleAddressChange = (value: string) => {
    setVehicleAddressInput(value);
    setVehicleSelectedLocation(null);
    setCreateVehicleFormError(null);
  };

  const handleOpenCreateVehicleScreen = () => {
    resetCreateVehicleForm();
    setScreenMode('create');
  };

  const handleSelectCreateVehicleAddress = (label: string, lat: number, lng: number) => {
    setVehicleAddressInput(label);
    setVehicleSelectedLocation({ lat, lng });
    setCreateVehicleFormError(null);
  };

  const handleOpenVehicleEditor = (vehicleId: string) => {
    const vehicle = myVehicles.find((item) => item.id === vehicleId);

    if (!vehicle) {
      return;
    }

    setEditingVehicleId(vehicle.id);
    setEditVehicleBrandInput(vehicle.brand);
    setEditVehicleModelInput(vehicle.model);
    setEditVehicleYearInput(String(vehicle.year));
    setEditVehicleLicensePlateInput(vehicle.licensePlate);
    setEditVehicleDescriptionInput(vehicle.description);
    setEditVehiclePricePerDayInput(String(vehicle.pricePerDay));
    setEditVehicleAddressInput(vehicle.locationAddress);
    setEditVehicleSelectedLocation({ lat: vehicle.locationLat, lng: vehicle.locationLng });
    setEditVehicleFormError(null);
    setEditVehicleFuelTypeInput(vehicle.fuelType ?? '');
    setEditVehicleTransmissionInput(vehicle.transmission ?? '');
    setEditVehicleSeatsInput(vehicle.seats !== null ? String(vehicle.seats) : '');
    setScreenMode('edit');
  };

  const handleBack = () => {
    if (screenMode === 'create') {
      resetCreateVehicleForm();
      setScreenMode('list');
      return;
    }

    if (screenMode === 'edit') {
      setEditingVehicleId(null);
      setScreenMode('list');
      return;
    }

    if (screenMode === 'images' || screenMode === 'availability') {
      setScreenMode('edit');
      return;
    }

    setScreenMode('list');
  };

  const handleOpenVehicleImagesScreen = async () => {
    if (!editingVehicleId) {
      return;
    }

    setScreenMode('images');
    await fetchVehicleImagesByVehicleId(editingVehicleId);
  };

  const handleOpenAvailabilityScreen = async () => {
    if (!editingVehicleId) {
      return;
    }

    resetAvailabilityForm();
    setScreenMode('availability');
    await fetchAvailabilityWindowsByVehicleId(editingVehicleId);
  };

  const handleUpdateVehicle = async () => {
    if (!editingVehicleId) {
      return;
    }

    const parsedYear = parseLocaleNumber(editVehicleYearInput);
    const parsedPrice = parseLocaleNumber(editVehiclePricePerDayInput);
    const parsedSeats = parseLocaleNumber(editVehicleSeatsInput);

    if (
      !editVehicleBrandInput.trim() ||
      !editVehicleModelInput.trim() ||
      !editVehicleLicensePlateInput.trim() ||
      !editVehicleDescriptionInput.trim() ||
      !editVehicleAddressInput.trim() ||
      Number.isNaN(parsedYear) ||
      Number.isNaN(parsedPrice)
    ) {
      setEditVehicleFormError('Completa todos los campos obligatorios para guardar cambios.');
      return;
    }

    if (!editVehicleSelectedLocation) {
      setEditVehicleFormError('Selecciona una direccion sugerida para obtener coordenadas validas.');
      return;
    }

    setEditVehicleFormError(null);

    await updateVehicleById(editingVehicleId, {
      brand: editVehicleBrandInput.trim(),
      model: editVehicleModelInput.trim(),
      year: parsedYear,
      licensePlate: editVehicleLicensePlateInput.trim().toUpperCase(),
      description: editVehicleDescriptionInput.trim(),
      pricePerDay: parsedPrice,
      locationLat: editVehicleSelectedLocation.lat,
      locationLng: editVehicleSelectedLocation.lng,
      locationAddress: editVehicleAddressInput.trim(),
      fuelType: ['gasoline', 'diesel', 'electric', 'hybrid'].includes(editVehicleFuelTypeInput)
        ? (editVehicleFuelTypeInput as 'gasoline' | 'diesel' | 'electric' | 'hybrid')
        : null,
      transmission: ['manual', 'automatic'].includes(editVehicleTransmissionInput)
        ? (editVehicleTransmissionInput as 'manual' | 'automatic')
        : null,
      seats: Number.isNaN(parsedSeats) ? null : parsedSeats,
      status: editingVehicle?.status ?? 'active'
    });

    await fetchMyVehicles();
  };

  const handleEditVehicleAddressChange = (value: string) => {
    setEditVehicleAddressInput(value);
    setEditVehicleSelectedLocation(null);
    setEditVehicleFormError(null);
  };

  const handleSelectEditVehicleAddress = (label: string, lat: number, lng: number) => {
    setEditVehicleAddressInput(label);
    setEditVehicleSelectedLocation({ lat, lng });
    setEditVehicleFormError(null);
  };

  const handleDeleteVehicle = async () => {
    if (!editingVehicleId) {
      return;
    }

    await deleteVehicleById(editingVehicleId);
    setEditingVehicleId(null);
    setScreenMode('list');
    await fetchMyVehicles();
  };

  const handlePickUploadAndCreateVehicleImage = async () => {
    if (!editingVehicleId) {
      return;
    }

    try {
      setVehicleImageUploading(true);
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const prepared = await prepareUploadImage(result.assets[0], 'vehicle_image');
      const uploaded = await uploadImageToApi({
        target: 'vehicle_image',
        ownerId: editingVehicleId,
        fileUri: prepared.fileUri,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        webFile: prepared.webFile
      });

      await createVehicleImageForVehicle(editingVehicleId, uploaded.persistedValue, false);
    } finally {
      setVehicleImageUploading(false);
    }
  };

  const handleSetPrimaryVehicleImage = async (imageId: string) => {
    if (!editingVehicleId) {
      return;
    }

    await updateVehicleImageById(imageId, editingVehicleId, { isPrimary: true });
  };

  const handleDeleteVehicleImage = async (imageId: string) => {
    if (!editingVehicleId) {
      return;
    }

    await deleteVehicleImageById(imageId, editingVehicleId);
  };

  const handleClearAvailabilityDraft = () => {
    setEditingAvailabilityWindowId(null);
    setAvailabilityStartInput('');
    setAvailabilityEndInput('');
  };

  const handleSaveAvailabilityWindow = async () => {
    if (!editingVehicleId) {
      return;
    }

    if (editingAvailabilityWindowId) {
      await updateAvailabilityWindowById(
        editingAvailabilityWindowId,
        editingVehicleId,
        availabilityStartInput,
        availabilityEndInput
      );
    } else {
      await createAvailabilityWindowForVehicle(
        editingVehicleId,
        availabilityStartInput,
        availabilityEndInput
      );
    }

    if (availabilityStartInput.trim() && availabilityEndInput.trim()) {
      setEditingAvailabilityWindowId(null);
      setAvailabilityStartInput('');
      setAvailabilityEndInput('');
    }
  };

  const handleDeleteAvailabilityWindow = async (windowId: string) => {
    if (!editingVehicleId) {
      return;
    }

    await deleteAvailabilityWindowById(windowId, editingVehicleId);

    if (editingAvailabilityWindowId === windowId) {
      setEditingAvailabilityWindowId(null);
      setAvailabilityStartInput('');
      setAvailabilityEndInput('');
    }
  };

  if (editingVehicle && editingVehicleId && screenMode === 'images') {
    return (
      <ScrollView
        style={localStyles.screenScroll}
        contentContainerStyle={[
          localStyles.screenContent,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding + spacingTokens.lg,
            paddingHorizontal: spacingTokens.lg
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title="Imagenes del vehiculo"
          subtitle={`Gestiona la galeria de ${editingVehicle.brand} ${editingVehicle.model} y marca la principal con estrella.`}
          centered={isDesktopWeb}
        />

        <View style={[styles.card, desktopCardStyle]}>
          <View style={localStyles.imagesActionRow}>
            <ActionButton
              label={vehicleImageUploading ? 'Subiendo...' : 'Subir desde galeria'}
              onPress={() => void handlePickUploadAndCreateVehicleImage()}
              disabled={vehicleImagesSaving || vehicleImageUploading}
            />
            <ActionButton label="Volver a edición" onPress={handleBack} variant="ghost" />
          </View>
        </View>

        {vehicleImagesLoading || vehicleImagesSaving || vehicleImageUploading ? <ActivityIndicator size="small" /> : null}
        {vehicleImagesError ? <Text style={styles.error}>{vehicleImagesError}</Text> : null}
        {vehicleImagesMutationMessage ? <Text style={styles.info}>{vehicleImagesMutationMessage}</Text> : null}

        <View style={[localStyles.imageGrid, isDesktopWeb ? localStyles.imageGridDesktop : undefined]}>
          {vehicleImages.map((image) => (
            <View key={image.id} style={[styles.card, localStyles.imageGridCard, isDesktopWeb ? localStyles.imageGridDesktopCard : undefined]}>
              {resolveStoredImageUrl(image.imageUrl) ? (
                <View style={localStyles.imageCardMediaWrap}>
                  <Image
                    source={{ uri: resolveStoredImageUrl(image.imageUrl) ?? '' }}
                    style={styles.vehicleImagePreview}
                    resizeMode="cover"
                  />
                  <Pressable
                    style={[localStyles.primaryStarButton, image.isPrimary ? localStyles.primaryStarButtonActive : undefined]}
                    onPress={() => void handleSetPrimaryVehicleImage(image.id)}
                    disabled={vehicleImagesSaving || image.isPrimary}
                  >
                    <Text style={[localStyles.primaryStarText, image.isPrimary ? localStyles.primaryStarTextActive : undefined]}>★</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.subtitle}>No se puede previsualizar (bucket privado o URL invalida).</Text>
              )}
              <Text style={styles.linkHint}>{image.isPrimary ? 'Foto principal' : 'Toca la estrella para marcar como principal'}</Text>
              <ActionButton
                label="Eliminar imagen"
                onPress={() => void handleDeleteVehicleImage(image.id)}
                variant="danger"
                disabled={vehicleImagesSaving}
              />
            </View>
          ))}
        </View>

      </ScrollView>
    );
  }

  if (!authUserId) {
    return (
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Mis Vehiculos"
          subtitle="Inicia sesion para gestionar tus vehiculos."
          centered={isDesktopWeb}
        />
      </View>
    );
  }

  if (editingVehicle && editingVehicleId && screenMode === 'availability') {
    return (
      <ScrollView
        style={localStyles.screenScroll}
        contentContainerStyle={[
          localStyles.screenContent,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding + spacingTokens.lg,
            paddingHorizontal: spacingTokens.lg
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title="Ventanas de disponibilidad"
          subtitle={`Gestiona disponibilidad para ${editingVehicle.brand} ${editingVehicle.model} con calendario.`}
          centered={isDesktopWeb}
        />

        <View style={[styles.card, desktopCardStyle]}>
          <CalendarPicker
            availabilityWindows={availabilityWindows.map((window) => ({
              id: window.id,
              startDatetime: window.startDatetime,
              endDatetime: window.endDatetime
            }))}
            bookings={[]}
            initialDateRange={initialAvailabilitySelection}
            mode="owner"
            onDateRangeChange={(startDate, startHour, endDate, endHour) => {
              setAvailabilityStartInput(buildIsoFromSelection(startDate, startHour));
              setAvailabilityEndInput(buildIsoFromSelection(endDate, endHour));
            }}
          />

          <View style={localStyles.actionRow}>
            <ActionButton
              label="Crear ventana"
              onPress={() => void handleSaveAvailabilityWindow()}
              disabled={availabilityWindowsSaving}
            />
          </View>

          {availabilityStartInput ? <Text style={styles.linkHint}>Inicio: {formatDateTime(availabilityStartInput)}</Text> : null}
          {availabilityEndInput ? <Text style={styles.linkHint}>Fin: {formatDateTime(availabilityEndInput)}</Text> : null}
        </View>

        {availabilityWindowsLoading || availabilityWindowsSaving ? <ActivityIndicator size="small" /> : null}
        {availabilityWindowsError ? <Text style={styles.error}>{availabilityWindowsError}</Text> : null}
        {availabilityWindowsMutationMessage ? <Text style={styles.info}>{availabilityWindowsMutationMessage}</Text> : null}

        {availabilityWindows.map((window) => (
          <View key={window.id} style={[styles.card, desktopCardStyle]}>
            <Text style={styles.row}><Text style={styles.label}>Inicio:</Text> {new Date(window.startDatetime).toLocaleString('es-ES')}</Text>
            <Text style={styles.row}><Text style={styles.label}>Fin:</Text> {new Date(window.endDatetime).toLocaleString('es-ES')}</Text>
            <View style={localStyles.actionRow}>
              <ActionButton
                label="Eliminar"
                variant="danger"
                onPress={() => void handleDeleteAvailabilityWindow(window.id)}
                disabled={availabilityWindowsSaving}
              />
            </View>
          </View>
        ))}

        <View style={localStyles.bottomNavRow}>
          <ActionButton label="Volver a edición" onPress={handleBack} variant="ghost" />
        </View>
      </ScrollView>
    );
  }

  if (editingVehicle && editingVehicleId) {
    return (
      <View style={localStyles.screenRoot}>
        <ScrollView
          style={localStyles.screenScroll}
          contentContainerStyle={[
            localStyles.screenContent,
            {
              paddingTop: topPadding,
              paddingBottom: bottomPadding + spacingTokens.xl,
              paddingHorizontal: spacingTokens.lg
            }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader
            title="Editar vehiculo"
            subtitle="Ajusta datos, fotos y disponibilidad desde un panel unico."
            centered={isDesktopWeb}
          />

          <View style={[styles.card, desktopCardStyle]}>
            <View style={localStyles.vehicleSummaryCard}>
              {resolveStoredImageUrl(imageByVehicleId[editingVehicle.id] ?? null) ? (
                <Image
                  source={{ uri: resolveStoredImageUrl(imageByVehicleId[editingVehicle.id] ?? null) ?? '' }}
                  style={localStyles.vehicleSummaryImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={localStyles.vehicleSummaryImagePlaceholder}>
                  <Text style={localStyles.vehicleSummaryImagePlaceholderText}>Sin foto principal</Text>
                </View>
              )}

              <View style={localStyles.vehicleSummaryContent}>
                <Text style={localStyles.vehicleSummaryTitle}>{editingVehicle.brand} {editingVehicle.model}</Text>
                <Text style={styles.linkHint}>{editingVehicle.locationAddress}</Text>
                <View style={localStyles.summaryMetaRow}>
                  <Text style={localStyles.summaryMetaText}>{editingVehicle.year}</Text>
                  <Text style={localStyles.summaryMetaText}>{formatCurrencyEUR(editingVehicle.pricePerDay)}</Text>
                </View>
              </View>
            </View>

            <View style={localStyles.formGrid}>
              <Field label="Marca" value={editVehicleBrandInput} onChangeText={setEditVehicleBrandInput} placeholder="Marca" />
              <Field label="Modelo" value={editVehicleModelInput} onChangeText={setEditVehicleModelInput} placeholder="Modelo" />
              <View style={localStyles.formGridRow}>
                <Field label="Año" value={editVehicleYearInput} onChangeText={setEditVehicleYearInput} placeholder="Año" keyboardType="number-pad" />
                <Field label="Precio por dia" value={editVehiclePricePerDayInput} onChangeText={setEditVehiclePricePerDayInput} placeholder="Precio" keyboardType="decimal-pad" />
              </View>
              <View style={localStyles.readOnlyFieldWrap}>
                <Text style={localStyles.fieldLabel}>Matricula</Text>
                <View style={localStyles.readOnlyFieldValueWrap}>
                  <Text style={localStyles.readOnlyFieldValueText}>{editVehicleLicensePlateInput}</Text>
                </View>
              </View>
              <Field label="Descripcion" value={editVehicleDescriptionInput} onChangeText={setEditVehicleDescriptionInput} placeholder="Descripcion" multiline />
              <SelectField
                label="Combustible"
                value={editVehicleFuelTypeInput}
                onChange={setEditVehicleFuelTypeInput}
                placeholder="Selecciona combustible"
                options={FUEL_TYPE_OPTIONS}
              />
              <SelectField
                label="Transmision"
                value={editVehicleTransmissionInput}
                onChange={setEditVehicleTransmissionInput}
                placeholder="Selecciona transmision"
                options={TRANSMISSION_OPTIONS}
              />
              <SelectField
                label="Plazas"
                value={editVehicleSeatsInput}
                onChange={setEditVehicleSeatsInput}
                placeholder="Selecciona plazas"
                options={SEATS_OPTIONS}
              />
              <Field label="Direccion" value={editVehicleAddressInput} onChangeText={handleEditVehicleAddressChange} placeholder="Escribe una direccion" />
            </View>

            {editVehicleAddressLoading ? <Text style={styles.linkHint}>Buscando direcciones...</Text> : null}
            {editVehicleAddressError ? <Text style={styles.error}>{editVehicleAddressError}</Text> : null}
            {editVehicleAddressSuggestions.length > 0 && !editVehicleSelectedLocation ? (
              <View style={localStyles.suggestionsList}>
                {editVehicleAddressSuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.id}
                    style={localStyles.suggestionItem}
                    onPress={() => handleSelectEditVehicleAddress(suggestion.label, suggestion.lat, suggestion.lng)}
                  >
                    <Text style={localStyles.suggestionLabel}>{suggestion.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {editVehicleSelectedLocation ? (
              <Text style={styles.linkHint}>
                Ubicacion seleccionada: {editVehicleSelectedLocation.lat.toFixed(5)}, {editVehicleSelectedLocation.lng.toFixed(5)}
              </Text>
            ) : null}
            {editVehicleFormError ? <Text style={styles.error}>{editVehicleFormError}</Text> : null}

            <View style={localStyles.actionRow}>
              <ActionButton label="Guardar cambios" onPress={() => void handleUpdateVehicle()} disabled={vehiclesCreating} />
              <ActionButton label="Eliminar" variant="danger" onPress={() => void handleDeleteVehicle()} disabled={vehiclesCreating} />
            </View>

            <View style={localStyles.actionRow}>
              <ActionButton label="Imagenes" onPress={() => void handleOpenVehicleImagesScreen()} disabled={vehiclesCreating} variant="ghost" />
              <ActionButton label="Disponibilidad" onPress={() => void handleOpenAvailabilityScreen()} disabled={vehiclesCreating} variant="ghost" />
            </View>

          </View>

          {vehiclesCreating ? <ActivityIndicator size="small" /> : null}
          {vehiclesMutationMessage ? <Text style={styles.info}>{vehiclesMutationMessage}</Text> : null}
          {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
        </ScrollView>

        <View style={localStyles.bottomNavRow}>
          <ActionButton label="Volver a lista" onPress={handleBack} variant="ghost" />
        </View>
      </View>
    );
  }

  if (screenMode === 'create') {
    return (
      <ScrollView
        style={localStyles.screenScroll}
        contentContainerStyle={[
          localStyles.screenContent,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding + spacingTokens.lg,
            paddingHorizontal: spacingTokens.lg
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title="Nuevo vehiculo"
          subtitle="Crea un anuncio con una ficha limpia, realista y lista para publicar."
          centered={isDesktopWeb}
        />

        <View style={[styles.card, desktopCardStyle]}>
          <View style={localStyles.formGrid}>
            <Field label="Marca" value={vehicleBrandInput} onChangeText={setVehicleBrandInput} placeholder="Marca" />
            <Field label="Modelo" value={vehicleModelInput} onChangeText={setVehicleModelInput} placeholder="Modelo" />
            <View style={localStyles.formGridRow}>
              <Field label="Año" value={vehicleYearInput} onChangeText={setVehicleYearInput} placeholder="Año" keyboardType="number-pad" />
              <Field label="Precio por dia" value={vehiclePricePerDayInput} onChangeText={setVehiclePricePerDayInput} placeholder="Precio" keyboardType="decimal-pad" />
            </View>
            <Field label="Matricula" value={vehicleLicensePlateInput} onChangeText={setVehicleLicensePlateInput} placeholder="Matricula" autoCapitalize="characters" />
            <Field label="Descripcion" value={vehicleDescriptionInput} onChangeText={setVehicleDescriptionInput} placeholder="Describe el vehiculo" multiline />
            <SelectField
              label="Combustible"
              value={vehicleFuelTypeInput}
              onChange={setVehicleFuelTypeInput}
              placeholder="Selecciona combustible"
              options={FUEL_TYPE_OPTIONS}
            />
            <SelectField
              label="Transmision"
              value={vehicleTransmissionInput}
              onChange={setVehicleTransmissionInput}
              placeholder="Selecciona transmision"
              options={TRANSMISSION_OPTIONS}
            />
            <SelectField
              label="Plazas"
              value={vehicleSeatsInput}
              onChange={setVehicleSeatsInput}
              placeholder="Selecciona plazas"
              options={SEATS_OPTIONS}
            />
            <Field label="Direccion" value={vehicleAddressInput} onChangeText={handleCreateVehicleAddressChange} placeholder="Escribe una direccion" />
          </View>

          {vehicleAddressLoading ? <Text style={styles.linkHint}>Buscando direcciones...</Text> : null}
          {vehicleAddressError ? <Text style={styles.error}>{vehicleAddressError}</Text> : null}
          {vehicleAddressSuggestions.length > 0 && !vehicleSelectedLocation ? (
            <View style={localStyles.suggestionsList}>
              {vehicleAddressSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  style={localStyles.suggestionItem}
                  onPress={() => handleSelectCreateVehicleAddress(suggestion.label, suggestion.lat, suggestion.lng)}
                >
                  <Text style={localStyles.suggestionLabel}>{suggestion.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {vehicleSelectedLocation ? (
            <Text style={styles.linkHint}>
              Ubicacion seleccionada: {vehicleSelectedLocation.lat.toFixed(5)}, {vehicleSelectedLocation.lng.toFixed(5)}
            </Text>
          ) : null}
          {createVehicleFormError ? <Text style={styles.error}>{createVehicleFormError}</Text> : null}

          <View style={localStyles.actionRow}>
            <ActionButton label={vehiclesCreating ? 'Creando...' : 'Crear vehiculo'} onPress={() => void handleCreateVehicle()} disabled={vehiclesCreating} />
            <ActionButton label="Cancelar" onPress={handleBack} variant="ghost" disabled={vehiclesCreating} />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={localStyles.screenRoot}>
      <ScrollView
        style={localStyles.screenScroll}
        contentContainerStyle={[
          localStyles.screenContent,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding + spacingTokens.lg,
            paddingHorizontal: spacingTokens.lg
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title="Mis vehiculos"
          subtitle="Gestiona anuncios, fotos y disponibilidad desde un panel preparado para la app real."
          centered={isDesktopWeb}
        />

        {vehiclesLoading || vehiclesCreating ? <ActivityIndicator size="small" /> : null}
        {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
        {vehiclesMutationMessage ? <Text style={styles.info}>{vehiclesMutationMessage}</Text> : null}

        <View style={[localStyles.vehicleGrid, isDesktopWeb ? localStyles.vehicleGridDesktop : undefined]}>
          {myVehicles.map((vehicle) => {
            const primaryImageUrl = resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null);

            return (
              <Pressable
                key={vehicle.id}
                style={[styles.card, localStyles.vehicleCard, isDesktopWeb ? localStyles.desktopListCard : undefined]}
                onPress={() => handleOpenVehicleEditor(vehicle.id)}
              >
                <View style={localStyles.vehicleCardMediaWrap}>
                  {primaryImageUrl ? (
                    <Image
                      source={{ uri: primaryImageUrl }}
                      style={localStyles.vehicleCardMedia}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={localStyles.vehicleCardMediaPlaceholder}>
                      <Text style={localStyles.vehicleCardMediaPlaceholderText}>Añade una foto para destacar el anuncio</Text>
                    </View>
                  )}
                </View>

                <View style={localStyles.vehicleCardBody}>
                  <View style={localStyles.vehicleCardHeaderRow}>
                    <View style={localStyles.vehicleCardTitleWrap}>
                      <Text style={localStyles.vehicleCardTitle}>{vehicle.brand} {vehicle.model}</Text>
                      <Text style={localStyles.vehicleCardSubtitle}>{vehicle.locationAddress}</Text>
                    </View>
                    <Text style={localStyles.vehiclePrice}>{vehicle.pricePerDay.toFixed(2)} EUR/dia</Text>
                  </View>

                  <View style={localStyles.vehicleMetaRow}>
                    <View style={localStyles.vehicleMetaChip}><Text style={localStyles.vehicleMetaChipText}>{vehicle.year}</Text></View>
                  </View>

                  <View style={localStyles.actionRow}>
                    <ActionButton label="Editar vehiculo" onPress={() => handleOpenVehicleEditor(vehicle.id)} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {!vehiclesLoading && !vehiclesError && myVehicles.length === 0 ? (
          <EmptyState title="Sin vehiculos" description="Este usuario no tiene vehiculos asociados." />
        ) : null}
      </ScrollView>

      <Pressable onPress={handleOpenCreateVehicleScreen} style={[localStyles.fab, { bottom: fabBottomOffset }]}>
        <Text style={localStyles.fabIcon}>+</Text>
        <Text style={localStyles.fabLabel}>Nuevo vehiculo</Text>
      </Pressable>
    </View>
  );
}

const localStyles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    position: 'relative'
  },
  screenScroll: {
    flex: 1
  },
  screenContent: {
    gap: spacingTokens.md
  },
  desktopCard: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center'
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
  imageGrid: {
    width: '100%',
    gap: spacingTokens.md
  },
  imageGridDesktop: {
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  imageGridCard: {
    gap: spacingTokens.sm
  },
  imageGridDesktopCard: {
    width: '31%',
    minWidth: 250,
    maxWidth: 320
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  imagesActionRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignSelf: 'center',
    justifyContent: 'center',
    width: 'auto',
    gap: spacingTokens.sm
  },
  centeredActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacingTokens.sm
  },
  bottomNavRow: {
    marginTop: spacingTokens.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacingTokens.lg
  },
  actionButton: {
    minHeight: 48,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    borderRadius: radiusTokens.input,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colorTokens.primary,
    backgroundColor: colorTokens.primary
  },
  actionButtonPrimary: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  actionButtonGhost: {
    backgroundColor: colorTokens.white,
    borderColor: colorTokens.border
  },
  actionButtonDanger: {
    backgroundColor: colorTokens.alert,
    borderColor: colorTokens.alert
  },
  actionButtonDisabled: {
    opacity: 0.55
  },
  actionButtonText: {
    color: colorTokens.white,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  actionButtonGhostText: {
    color: colorTokens.secondary
  },
  actionButtonDangerText: {
    color: colorTokens.white
  },
  fab: {
    position: 'absolute',
    right: spacingTokens.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.md,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.accent2,
    ...shadowTokens.card
  },
  fabIcon: {
    color: colorTokens.white,
    fontSize: 18,
    fontWeight: '700'
  },
  fabLabel: {
    color: colorTokens.white,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  fieldWrap: {
    gap: spacingTokens.xs
  },
  fieldLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  selectTrigger: {
    minHeight: 50,
    paddingHorizontal: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.sm
  },
  selectValueText: {
    color: colorTokens.primary,
    ...typographyTokens.body,
    fontWeight: '600',
    flex: 1
  },
  selectPlaceholderText: {
    color: colorTokens.textMuted,
    ...typographyTokens.body,
    flex: 1
  },
  selectChevron: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  selectOptions: {
    marginTop: spacingTokens.xs,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    overflow: 'hidden'
  },
  selectOptionItem: {
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border
  },
  selectOptionItemLast: {
    borderBottomWidth: 0
  },
  multilineInput: {
    minHeight: 108,
    textAlignVertical: 'top'
  },
  readOnlyFieldWrap: {
    gap: spacingTokens.xs
  },
  readOnlyFieldValueWrap: {
    minHeight: 50,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight,
    justifyContent: 'center'
  },
  readOnlyFieldValueText: {
    color: colorTokens.secondary,
    ...typographyTokens.body,
    fontWeight: '700'
  },
  formGrid: {
    gap: spacingTokens.md
  },
  formGridRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  vehicleSummaryCard: {
    flexDirection: 'row',
    gap: spacingTokens.md,
    alignItems: 'center',
    marginBottom: spacingTokens.md,
    padding: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.bgLight
  },
  vehicleSummaryImage: {
    width: 88,
    height: 88,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  vehicleSummaryImagePlaceholder: {
    width: 88,
    height: 88,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.white,
    borderWidth: 1,
    borderColor: colorTokens.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  vehicleSummaryImagePlaceholderText: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    textAlign: 'center'
  },
  vehicleSummaryContent: {
    flex: 1,
    gap: spacingTokens.xs
  },
  vehicleSummaryTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  summaryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.xs
  },
  summaryMetaText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  vehicleCard: {
    gap: spacingTokens.md
  },
  vehicleCardMediaWrap: {
    borderRadius: radiusTokens.input,
    overflow: 'hidden'
  },
  vehicleCardMedia: {
    width: '100%',
    height: 190,
    backgroundColor: colorTokens.bgLight
  },
  vehicleCardMediaPlaceholder: {
    width: '100%',
    height: 190,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingTokens.md
  },
  vehicleCardMediaPlaceholderText: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    textAlign: 'center'
  },
  vehicleCardBody: {
    gap: spacingTokens.sm
  },
  vehicleCardHeaderRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  vehicleCardTitleWrap: {
    flex: 1,
    gap: 2
  },
  vehicleCardTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  vehicleCardSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  vehiclePrice: {
    color: colorTokens.secondary,
    ...typographyTokens.sectionLabel,
    textAlign: 'right'
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.xs
  },
  vehicleMetaChip: {
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.bgLight,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  vehicleMetaChipText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  imageCardMediaWrap: {
    position: 'relative',
    borderRadius: radiusTokens.input,
    overflow: 'hidden'
  },
  primaryStarButton: {
    position: 'absolute',
    top: spacingTokens.sm,
    right: spacingTokens.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryStarButtonActive: {
    borderColor: colorTokens.accent1,
    backgroundColor: colorTokens.accent1
  },
  primaryStarText: {
    color: colorTokens.secondary,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700'
  },
  primaryStarTextActive: {
    color: colorTokens.primary
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
    paddingVertical: spacingTokens.sm,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border
  },
  suggestionLabel: {
    color: colorTokens.primary,
    ...typographyTokens.caption
  }
});
