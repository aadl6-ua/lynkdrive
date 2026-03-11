import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { useUserProfileStore } from './src/store/useUserProfileStore';
import { useVehicleAvailabilityWindowsStore } from './src/store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from './src/store/useVehicleImagesStore';
import { useVehiclesStore } from './src/store/useVehiclesStore';
import { UploadTarget, uploadImageToApi } from './src/api/uploads';
import { resolveStoredImageUrl } from './src/api/storage';
import { prepareUploadImage } from './src/api/prepareUploadImage';
import { useAuthStore } from './src/store/useAuthStore';

type TabKey = 'explore' | 'trips' | 'myVehicles' | 'profile';
type MyVehiclesScreen = 'list' | 'edit' | 'images' | 'availability';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'explore', label: 'Explorar' },
  { key: 'trips', label: 'Mis Viajes' },
  { key: 'myVehicles', label: 'Mis Vehículos' },
  { key: 'profile', label: 'Perfil' }
];

function parseLocaleNumber(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [myVehiclesScreen, setMyVehiclesScreen] = useState<MyVehiclesScreen>('list');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [idDocumentInput, setIdDocumentInput] = useState('');
  const [driverLicenseInput, setDriverLicenseInput] = useState('');
  const [vehicleBrandInput, setVehicleBrandInput] = useState('Toyota');
  const [vehicleModelInput, setVehicleModelInput] = useState('Corolla');
  const [vehicleYearInput, setVehicleYearInput] = useState('2020');
  const [vehicleLicensePlateInput, setVehicleLicensePlateInput] = useState('1234ABC');
  const [vehicleDescriptionInput, setVehicleDescriptionInput] = useState('Vehículo de prueba para el TFG.');
  const [vehiclePricePerDayInput, setVehiclePricePerDayInput] = useState('45');
  const [vehicleLatInput, setVehicleLatInput] = useState('40.4168');
  const [vehicleLngInput, setVehicleLngInput] = useState('-3.7038');
  const [vehicleAddressInput, setVehicleAddressInput] = useState('Madrid Centro');
  const [vehicleFuelTypeInput, setVehicleFuelTypeInput] = useState('hybrid');
  const [vehicleTransmissionInput, setVehicleTransmissionInput] = useState('automatic');
  const [vehicleSeatsInput, setVehicleSeatsInput] = useState('5');
  const [exploreMaxPriceInput, setExploreMaxPriceInput] = useState('');
  const [exploreFuelTypeInput, setExploreFuelTypeInput] = useState('');
  const [exploreTransmissionInput, setExploreTransmissionInput] = useState('');
  const [exploreSeatsInput, setExploreSeatsInput] = useState('');
  const [exploreLatInput, setExploreLatInput] = useState('');
  const [exploreLngInput, setExploreLngInput] = useState('');
  const [exploreRadiusInput, setExploreRadiusInput] = useState('');
  const [editVehicleBrandInput, setEditVehicleBrandInput] = useState('');
  const [editVehicleModelInput, setEditVehicleModelInput] = useState('');
  const [editVehicleYearInput, setEditVehicleYearInput] = useState('');
  const [editVehicleLicensePlateInput, setEditVehicleLicensePlateInput] = useState('');
  const [editVehicleDescriptionInput, setEditVehicleDescriptionInput] = useState('');
  const [editVehiclePricePerDayInput, setEditVehiclePricePerDayInput] = useState('');
  const [editVehicleLatInput, setEditVehicleLatInput] = useState('');
  const [editVehicleLngInput, setEditVehicleLngInput] = useState('');
  const [editVehicleAddressInput, setEditVehicleAddressInput] = useState('');
  const [editVehicleFuelTypeInput, setEditVehicleFuelTypeInput] = useState('');
  const [editVehicleTransmissionInput, setEditVehicleTransmissionInput] = useState('');
  const [editVehicleSeatsInput, setEditVehicleSeatsInput] = useState('');
  const [editVehicleStatusInput, setEditVehicleStatusInput] = useState<'active' | 'inactive'>('active');
  const [vehicleImageUrlInput, setVehicleImageUrlInput] = useState('');
  const [vehicleImageIsPrimaryInput, setVehicleImageIsPrimaryInput] = useState('false');
  const [availabilityStartInput, setAvailabilityStartInput] = useState('');
  const [availabilityEndInput, setAvailabilityEndInput] = useState('');
  const [editingAvailabilityWindowId, setEditingAvailabilityWindowId] = useState<string | null>(null);
  const [profileUploadingField, setProfileUploadingField] = useState<UploadTarget | null>(null);
  const [profileUploadMessage, setProfileUploadMessage] = useState<string | null>(null);
  const [vehicleImageUploading, setVehicleImageUploading] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktopLike = Platform.OS === 'web' || width >= 768;

  const {
    selectedUserId,
    profile,
    loading,
    saving,
    error,
    mutationMessage,
    setSelectedUserId,
    fetchProfile,
    fetchMyProfile,
    createProfile,
    updateProfile,
    updateMyProfile,
    deleteProfile
  } = useUserProfileStore();

  const {
    userId: authUserId,
    email: authEmail,
    loading: authLoading,
    error: authError,
    message: authMessage,
    emailInput,
    passwordInput,
    setEmailInput,
    setPasswordInput,
    hydrateSession,
    signIn,
    signUp,
    signOut
  } = useAuthStore();

  const {
    items: vehicles,
    loading: vehiclesLoading,
    creating: vehiclesCreating,
    error: vehiclesError,
    mutationMessage: vehiclesMutationMessage,
    fetchVehicles,
    createVehicleForOwner,
    updateVehicleById,
    deleteVehicleById
  } = useVehiclesStore();

  const {
    items: vehicleImages,
    loading: vehicleImagesLoading,
    saving: vehicleImagesSaving,
    error: vehicleImagesError,
    mutationMessage: vehicleImagesMutationMessage,
    fetchByVehicleId: fetchVehicleImagesByVehicleId,
    createForVehicle: createVehicleImageForVehicle,
    deleteById: deleteVehicleImageById
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

  useEffect(() => {
    fetchVehicles();
    fetchProfile();
  }, [fetchVehicles, fetchProfile]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!authUserId) {
      return;
    }

    setSelectedUserId(authUserId);
    fetchMyProfile();
    fetchVehicles();
  }, [authUserId, fetchMyProfile, fetchVehicles, setSelectedUserId]);

  useEffect(() => {
    setFirstNameInput(profile?.firstName ?? '');
    setLastNameInput(profile?.lastName ?? '');
    setPhoneInput(profile?.phoneNumber ?? '');
    setAvatarInput(profile?.avatarUrl ?? '');
    setIdDocumentInput(profile?.idDocumentUrl ?? '');
    setDriverLicenseInput(profile?.driverLicenseUrl ?? '');
  }, [profile]);

  const myVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.ownerId === selectedUserId),
    [vehicles, selectedUserId]
  );

  const resolvedProfileAvatarUrl = useMemo(
    () => resolveStoredImageUrl(profile?.avatarUrl ?? null),
    [profile?.avatarUrl]
  );

  const editingVehicle = useMemo(
    () => myVehicles.find((vehicle) => vehicle.id === editingVehicleId) ?? null,
    [myVehicles, editingVehicleId]
  );

  const handleReloadForSelectedUser = async () => {
    await Promise.all([fetchProfile(), fetchVehicles()]);
  };

  const buildPayload = () => ({
    firstName: firstNameInput.trim(),
    lastName: lastNameInput.trim(),
    phoneNumber: phoneInput.trim() || null,
    avatarUrl: avatarInput.trim() || null,
    idDocumentUrl: idDocumentInput.trim() || null,
    driverLicenseUrl: driverLicenseInput.trim() || null
  });

  const handleCreateUser = async () => {
    await createProfile(buildPayload());
    await fetchVehicles();
  };

  const handleUpdateUser = async () => {
    if (authUserId) {
      await updateMyProfile(buildPayload());
    } else {
      await updateProfile(buildPayload());
    }

    await fetchVehicles();
  };

  const handleDeleteUser = async () => {
    await deleteProfile();
    await fetchVehicles();
  };

  const pickSingleImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      throw new Error('Permiso de galeria denegado');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0];
  };

  const uploadPickedImage = async (target: UploadTarget, ownerId?: string) => {
    const asset = await pickSingleImage();

    if (!asset) {
      return null;
    }

    const prepared = await prepareUploadImage(asset, target);

    const uploaded = await uploadImageToApi({
      target,
      ownerId,
      fileUri: prepared.fileUri,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      webFile: prepared.webFile
    });

    return uploaded.persistedValue;
  };

  const handleUploadUserImage = async (target: 'avatar' | 'id_document' | 'driver_license') => {
    try {
      setProfileUploadingField(target);
      setProfileUploadMessage(null);

      const uploadedUrl = await uploadPickedImage(target, selectedUserId);

      if (!uploadedUrl) {
        return;
      }

      if (target === 'avatar') {
        setAvatarInput(uploadedUrl);
      }

      if (target === 'id_document') {
        setIdDocumentInput(uploadedUrl);
      }

      if (target === 'driver_license') {
        setDriverLicenseInput(uploadedUrl);
      }

      setProfileUploadMessage('Imagen subida. Pulsa Guardar para persistir la URL en el perfil.');
    } catch {
      setProfileUploadMessage('No se pudo comprimir o subir la imagen. Revisa permisos, tamano y configuracion de buckets.');
    } finally {
      setProfileUploadingField(null);
    }
  };

  const handleCreateVehicle = async () => {
    const parsedYear = parseLocaleNumber(vehicleYearInput);
    const parsedPrice = parseLocaleNumber(vehiclePricePerDayInput);
    const parsedLat = parseLocaleNumber(vehicleLatInput);
    const parsedLng = parseLocaleNumber(vehicleLngInput);
    const parsedSeats = parseLocaleNumber(vehicleSeatsInput);

    if (
      !vehicleBrandInput.trim() ||
      !vehicleModelInput.trim() ||
      !vehicleLicensePlateInput.trim() ||
      !vehicleDescriptionInput.trim() ||
      !vehicleAddressInput.trim() ||
      Number.isNaN(parsedYear) ||
      Number.isNaN(parsedPrice) ||
      Number.isNaN(parsedLat) ||
      Number.isNaN(parsedLng)
    ) {
      return;
    }

    await createVehicleForOwner(selectedUserId, {
      brand: vehicleBrandInput.trim(),
      model: vehicleModelInput.trim(),
      year: parsedYear,
      licensePlate: vehicleLicensePlateInput.trim().toUpperCase(),
      description: vehicleDescriptionInput.trim(),
      pricePerDay: parsedPrice,
      locationLat: parsedLat,
      locationLng: parsedLng,
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
  };

  const handleApplyExploreFilters = async () => {
    const parsedMaxPrice = parseLocaleNumber(exploreMaxPriceInput);
    const parsedSeats = parseLocaleNumber(exploreSeatsInput);
    const parsedLat = parseLocaleNumber(exploreLatInput);
    const parsedLng = parseLocaleNumber(exploreLngInput);
    const parsedRadius = parseLocaleNumber(exploreRadiusInput);

    await fetchVehicles({
      maxPrice: exploreMaxPriceInput.trim() && !Number.isNaN(parsedMaxPrice) ? parsedMaxPrice : undefined,
      fuelType: ['gasoline', 'diesel', 'electric', 'hybrid'].includes(exploreFuelTypeInput)
        ? (exploreFuelTypeInput as 'gasoline' | 'diesel' | 'electric' | 'hybrid')
        : undefined,
      transmission: ['manual', 'automatic'].includes(exploreTransmissionInput)
        ? (exploreTransmissionInput as 'manual' | 'automatic')
        : undefined,
      seats: exploreSeatsInput.trim() && !Number.isNaN(parsedSeats) ? parsedSeats : undefined,
      lat: exploreLatInput.trim() && !Number.isNaN(parsedLat) ? parsedLat : undefined,
      lng: exploreLngInput.trim() && !Number.isNaN(parsedLng) ? parsedLng : undefined,
      radiusKm: exploreRadiusInput.trim() && !Number.isNaN(parsedRadius) ? parsedRadius : undefined
    });
  };

  const handleClearExploreFilters = async () => {
    setExploreMaxPriceInput('');
    setExploreFuelTypeInput('');
    setExploreTransmissionInput('');
    setExploreSeatsInput('');
    setExploreLatInput('');
    setExploreLngInput('');
    setExploreRadiusInput('');
    await fetchVehicles();
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
    setEditVehicleLatInput(String(vehicle.locationLat));
    setEditVehicleLngInput(String(vehicle.locationLng));
    setEditVehicleAddressInput(vehicle.locationAddress);
    setEditVehicleFuelTypeInput(vehicle.fuelType ?? '');
    setEditVehicleTransmissionInput(vehicle.transmission ?? '');
    setEditVehicleSeatsInput(vehicle.seats !== null ? String(vehicle.seats) : '');
    setEditVehicleStatusInput(vehicle.status);
    setMyVehiclesScreen('edit');
  };

  const handleBackFromMyVehiclesScreen = () => {
    if (myVehiclesScreen === 'edit') {
      setEditingVehicleId(null);
      setMyVehiclesScreen('list');

      return;
    }

    setMyVehiclesScreen('edit');
  };

  const handleOpenVehicleImagesScreen = async () => {
    if (!editingVehicleId) {
      return;
    }

    setVehicleImageUrlInput('');
    setVehicleImageIsPrimaryInput('false');
    setMyVehiclesScreen('images');
    await fetchVehicleImagesByVehicleId(editingVehicleId);
  };

  const handleOpenAvailabilityScreen = async () => {
    if (!editingVehicleId) {
      return;
    }

    setAvailabilityStartInput('');
    setAvailabilityEndInput('');
    setEditingAvailabilityWindowId(null);
    setMyVehiclesScreen('availability');
    await fetchAvailabilityWindowsByVehicleId(editingVehicleId);
  };

  const handleUpdateVehicle = async () => {
    if (!editingVehicleId) {
      return;
    }

    const parsedYear = parseLocaleNumber(editVehicleYearInput);
    const parsedPrice = parseLocaleNumber(editVehiclePricePerDayInput);
    const parsedLat = parseLocaleNumber(editVehicleLatInput);
    const parsedLng = parseLocaleNumber(editVehicleLngInput);
    const parsedSeats = parseLocaleNumber(editVehicleSeatsInput);

    if (
      !editVehicleBrandInput.trim() ||
      !editVehicleModelInput.trim() ||
      !editVehicleLicensePlateInput.trim() ||
      !editVehicleDescriptionInput.trim() ||
      !editVehicleAddressInput.trim() ||
      Number.isNaN(parsedYear) ||
      Number.isNaN(parsedPrice) ||
      Number.isNaN(parsedLat) ||
      Number.isNaN(parsedLng)
    ) {
      return;
    }

    await updateVehicleById(editingVehicleId, {
      brand: editVehicleBrandInput.trim(),
      model: editVehicleModelInput.trim(),
      year: parsedYear,
      licensePlate: editVehicleLicensePlateInput.trim().toUpperCase(),
      description: editVehicleDescriptionInput.trim(),
      pricePerDay: parsedPrice,
      locationLat: parsedLat,
      locationLng: parsedLng,
      locationAddress: editVehicleAddressInput.trim(),
      fuelType: ['gasoline', 'diesel', 'electric', 'hybrid'].includes(editVehicleFuelTypeInput)
        ? (editVehicleFuelTypeInput as 'gasoline' | 'diesel' | 'electric' | 'hybrid')
        : null,
      transmission: ['manual', 'automatic'].includes(editVehicleTransmissionInput)
        ? (editVehicleTransmissionInput as 'manual' | 'automatic')
        : null,
      seats: Number.isNaN(parsedSeats) ? null : parsedSeats,
      status: editVehicleStatusInput
    });

    await fetchVehicles();
  };

  const handleDeleteVehicle = async () => {
    if (!editingVehicleId) {
      return;
    }

    await deleteVehicleById(editingVehicleId);
    setEditingVehicleId(null);
    setMyVehiclesScreen('list');
    await fetchVehicles();
  };

  const handleCreateVehicleImage = async () => {
    if (!editingVehicleId) {
      return;
    }

    const normalizedPrimary = vehicleImageIsPrimaryInput.trim().toLowerCase();
    const isPrimary =
      normalizedPrimary === 'true' ||
      normalizedPrimary === '1' ||
      normalizedPrimary === 'si' ||
      normalizedPrimary === 'sí';

    await createVehicleImageForVehicle(editingVehicleId, vehicleImageUrlInput, isPrimary);

    if (vehicleImageUrlInput.trim()) {
      setVehicleImageUrlInput('');
      setVehicleImageIsPrimaryInput('false');
    }
  };

  const handlePickUploadAndCreateVehicleImage = async () => {
    if (!editingVehicleId) {
      return;
    }

    const normalizedPrimary = vehicleImageIsPrimaryInput.trim().toLowerCase();
    const isPrimary =
      normalizedPrimary === 'true' ||
      normalizedPrimary === '1' ||
      normalizedPrimary === 'si' ||
      normalizedPrimary === 'sí';

    try {
      setVehicleImageUploading(true);
      const uploadedUrl = await uploadPickedImage('vehicle_image', editingVehicleId);

      if (!uploadedUrl) {
        return;
      }

      await createVehicleImageForVehicle(editingVehicleId, uploadedUrl, isPrimary);
      setVehicleImageUrlInput('');
      setVehicleImageIsPrimaryInput('false');
    } finally {
      setVehicleImageUploading(false);
    }
  };

  const handleDeleteVehicleImage = async (imageId: string) => {
    if (!editingVehicleId) {
      return;
    }

    await deleteVehicleImageById(imageId, editingVehicleId);
  };

  const handleSelectAvailabilityWindowForEdit = (windowId: string, startDatetime: string, endDatetime: string) => {
    setEditingAvailabilityWindowId(windowId);
    setAvailabilityStartInput(startDatetime);
    setAvailabilityEndInput(endDatetime);
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

  const renderContent = () => {
    if (activeTab === 'explore') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>Listado de vehículos cercanos, filtros y acceso a ficha.</Text>

          <View style={styles.card}>
            <Text style={styles.switcherTitle}>Filtros</Text>
            <TextInput
              value={exploreMaxPriceInput}
              onChangeText={setExploreMaxPriceInput}
              style={styles.input}
              placeholder="Precio máximo (€)"
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
              placeholder="Transmisión: manual|automatic"
              autoCapitalize="none"
            />
            <TextInput
              value={exploreSeatsInput}
              onChangeText={setExploreSeatsInput}
              style={styles.input}
              placeholder="Plazas mínimas"
              keyboardType="number-pad"
            />
            <TextInput
              value={exploreLatInput}
              onChangeText={setExploreLatInput}
              style={styles.input}
              placeholder="Latitud centro"
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              value={exploreLngInput}
              onChangeText={setExploreLngInput}
              style={styles.input}
              placeholder="Longitud centro"
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              value={exploreRadiusInput}
              onChangeText={setExploreRadiusInput}
              style={styles.input}
              placeholder="Radio (km)"
              keyboardType="decimal-pad"
            />

            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrapper}>
                <Button title="Aplicar" onPress={handleApplyExploreFilters} />
              </View>
              <View style={styles.actionButtonWrapper}>
                <Button title="Limpiar" onPress={handleClearExploreFilters} />
              </View>
            </View>
          </View>

          {vehiclesLoading ? <ActivityIndicator size="small" /> : null}

          {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}

          {vehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.card}>
              <Text style={styles.row}>
                <Text style={styles.label}>Vehículo:</Text> {vehicle.brand} {vehicle.model} ({vehicle.year})
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Precio/día:</Text> {vehicle.pricePerDay.toFixed(2)} €
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Ubicación:</Text> {vehicle.locationAddress}
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Combustible:</Text> {vehicle.fuelType ?? 'No definido'}
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Transmisión:</Text> {vehicle.transmission ?? 'No definida'}
              </Text>
              <Text style={styles.row}>
                <Text style={styles.label}>Es mío:</Text> {vehicle.ownerId === selectedUserId ? 'Sí' : 'No'}
              </Text>
            </View>
          ))}

          {!vehiclesLoading && !vehiclesError && vehicles.length === 0 ? (
            <Text style={styles.subtitle}>No hay vehículos disponibles todavía.</Text>
          ) : null}
        </View>
      );
    }

    if (activeTab === 'trips') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.title}>Mis Viajes</Text>
          <Text style={styles.subtitle}>Solicitudes enviadas, recibidas y calendario.</Text>
          <View style={styles.card}>
            <Text style={styles.row}><Text style={styles.label}>Usuario activo:</Text> {selectedUserId}</Text>
            <Text style={styles.row}><Text style={styles.label}>Nombre:</Text> {profile ? `${profile.firstName} ${profile.lastName}` : 'Sin cargar'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Estado:</Text> API de reservas pendiente de implementar</Text>
          </View>
        </View>
      );
    }

    if (activeTab === 'myVehicles') {
      if (editingVehicle && editingVehicleId && myVehiclesScreen === 'images') {
        return (
          <View style={styles.sectionCard}>
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrapper}>
                <Button title="Volver" onPress={handleBackFromMyVehiclesScreen} />
              </View>
            </View>

            <Text style={styles.title}>Imágenes del Vehículo</Text>
            <Text style={styles.subtitle}>Alta, lectura y borrado de fotos para {editingVehicle.brand} {editingVehicle.model}.</Text>

            <View style={styles.card}>
              <TextInput
                value={vehicleImageUrlInput}
                onChangeText={setVehicleImageUrlInput}
                style={styles.input}
                placeholder="URL imagen"
                autoCapitalize="none"
              />
              <TextInput
                value={vehicleImageIsPrimaryInput}
                onChangeText={setVehicleImageIsPrimaryInput}
                style={styles.input}
                placeholder="Principal: true|false"
                autoCapitalize="none"
              />

              <View style={styles.buttonContainer}>
                <Button
                  title="Crear imagen"
                  onPress={handleCreateVehicleImage}
                  disabled={vehicleImagesSaving || vehicleImageUploading}
                />
              </View>

              <View style={styles.buttonContainer}>
                <Button
                  title={vehicleImageUploading ? 'Subiendo imagen...' : 'Seleccionar, subir y crear'}
                  onPress={handlePickUploadAndCreateVehicleImage}
                  disabled={vehicleImagesSaving || vehicleImageUploading}
                />
              </View>
            </View>

            {vehicleImagesLoading || vehicleImagesSaving || vehicleImageUploading ? <ActivityIndicator size="small" /> : null}
            {vehicleImagesError ? <Text style={styles.error}>{vehicleImagesError}</Text> : null}
            {vehicleImagesMutationMessage ? <Text style={styles.info}>{vehicleImagesMutationMessage}</Text> : null}

            {vehicleImages.map((image) => (
              <View key={image.id} style={styles.card}>
                <Text style={styles.row}><Text style={styles.label}>ID:</Text> {image.id}</Text>
                <Text style={styles.row}><Text style={styles.label}>URL:</Text> {image.imageUrl}</Text>
                {resolveStoredImageUrl(image.imageUrl) ? (
                  <Image
                    source={{ uri: resolveStoredImageUrl(image.imageUrl) ?? '' }}
                    style={styles.vehicleImagePreview}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.subtitle}>No se puede previsualizar (bucket privado o URL invalida).</Text>
                )}
                <Text style={styles.row}><Text style={styles.label}>Principal:</Text> {image.isPrimary ? 'Sí' : 'No'}</Text>
                <Text style={styles.row}><Text style={styles.label}>Alta:</Text> {new Date(image.createdAt).toLocaleString('es-ES')}</Text>
                <View style={styles.buttonContainer}>
                  <Button
                    title="Eliminar imagen"
                    onPress={() => handleDeleteVehicleImage(image.id)}
                    color="#b00020"
                    disabled={vehicleImagesSaving}
                  />
                </View>
              </View>
            ))}

            {!vehicleImagesLoading && !vehicleImagesError && vehicleImages.length === 0 ? (
              <Text style={styles.subtitle}>Este vehículo no tiene imágenes todavía.</Text>
            ) : null}
          </View>
        );
      }

      if (editingVehicle && editingVehicleId && myVehiclesScreen === 'availability') {
        return (
          <View style={styles.sectionCard}>
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrapper}>
                <Button title="Volver" onPress={handleBackFromMyVehiclesScreen} />
              </View>
            </View>

            <Text style={styles.title}>Ventanas de Disponibilidad</Text>
            <Text style={styles.subtitle}>CRUD completo de ventanas para {editingVehicle.brand} {editingVehicle.model}.</Text>

            <View style={styles.card}>
              <TextInput
                value={availabilityStartInput}
                onChangeText={setAvailabilityStartInput}
                style={styles.input}
                placeholder="Inicio ISO (ej: 2026-03-10T09:00:00Z)"
                autoCapitalize="none"
              />
              <TextInput
                value={availabilityEndInput}
                onChangeText={setAvailabilityEndInput}
                style={styles.input}
                placeholder="Fin ISO (ej: 2026-03-20T20:00:00Z)"
                autoCapitalize="none"
              />

              <View style={styles.actionsRow}>
                <View style={styles.actionButtonWrapper}>
                  <Button
                    title={editingAvailabilityWindowId ? 'Actualizar ventana' : 'Crear ventana'}
                    onPress={handleSaveAvailabilityWindow}
                    disabled={availabilityWindowsSaving}
                  />
                </View>
                {editingAvailabilityWindowId ? (
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title="Cancelar edición"
                      onPress={() => {
                        setEditingAvailabilityWindowId(null);
                        setAvailabilityStartInput('');
                        setAvailabilityEndInput('');
                      }}
                      disabled={availabilityWindowsSaving}
                    />
                  </View>
                ) : null}
              </View>
            </View>

            {availabilityWindowsLoading || availabilityWindowsSaving ? <ActivityIndicator size="small" /> : null}
            {availabilityWindowsError ? <Text style={styles.error}>{availabilityWindowsError}</Text> : null}
            {availabilityWindowsMutationMessage ? <Text style={styles.info}>{availabilityWindowsMutationMessage}</Text> : null}

            {availabilityWindows.map((window) => (
              <View key={window.id} style={styles.card}>
                <Text style={styles.row}><Text style={styles.label}>ID:</Text> {window.id}</Text>
                <Text style={styles.row}><Text style={styles.label}>Inicio:</Text> {new Date(window.startDatetime).toLocaleString('es-ES')}</Text>
                <Text style={styles.row}><Text style={styles.label}>Fin:</Text> {new Date(window.endDatetime).toLocaleString('es-ES')}</Text>
                <View style={styles.actionsRow}>
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title="Editar"
                      onPress={() =>
                        handleSelectAvailabilityWindowForEdit(
                          window.id,
                          window.startDatetime,
                          window.endDatetime
                        )
                      }
                      disabled={availabilityWindowsSaving}
                    />
                  </View>
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title="Eliminar"
                      color="#b00020"
                      onPress={() => handleDeleteAvailabilityWindow(window.id)}
                      disabled={availabilityWindowsSaving}
                    />
                  </View>
                </View>
              </View>
            ))}

            {!availabilityWindowsLoading && !availabilityWindowsError && availabilityWindows.length === 0 ? (
              <Text style={styles.subtitle}>Este vehículo no tiene ventanas de disponibilidad todavía.</Text>
            ) : null}
          </View>
        );
      }

      if (editingVehicle && editingVehicleId) {
        return (
          <View style={styles.sectionCard}>
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrapper}>
                <Button title="Volver" onPress={handleBackFromMyVehiclesScreen} />
              </View>
            </View>

            <Text style={styles.title}>Editar Vehículo</Text>
            <Text style={styles.subtitle}>Pantalla secundaria de edición y borrado.</Text>

            <View style={styles.card}>
              <TextInput value={editVehicleBrandInput} onChangeText={setEditVehicleBrandInput} style={styles.input} placeholder="Marca" />
              <TextInput value={editVehicleModelInput} onChangeText={setEditVehicleModelInput} style={styles.input} placeholder="Modelo" />
              <TextInput value={editVehicleYearInput} onChangeText={setEditVehicleYearInput} style={styles.input} placeholder="Año" keyboardType="number-pad" />
              <TextInput value={editVehicleLicensePlateInput} onChangeText={setEditVehicleLicensePlateInput} style={styles.input} placeholder="Matrícula" autoCapitalize="characters" />
              <TextInput value={editVehicleDescriptionInput} onChangeText={setEditVehicleDescriptionInput} style={styles.input} placeholder="Descripción" />
              <TextInput value={editVehiclePricePerDayInput} onChangeText={setEditVehiclePricePerDayInput} style={styles.input} placeholder="Precio por día" keyboardType="decimal-pad" />
              <TextInput value={editVehicleLatInput} onChangeText={setEditVehicleLatInput} style={styles.input} placeholder="Latitud" keyboardType="numbers-and-punctuation" />
              <TextInput value={editVehicleLngInput} onChangeText={setEditVehicleLngInput} style={styles.input} placeholder="Longitud" keyboardType="numbers-and-punctuation" />
              <TextInput value={editVehicleAddressInput} onChangeText={setEditVehicleAddressInput} style={styles.input} placeholder="Dirección" />
              <TextInput value={editVehicleFuelTypeInput} onChangeText={setEditVehicleFuelTypeInput} style={styles.input} placeholder="Combustible: gasoline|diesel|electric|hybrid" autoCapitalize="none" />
              <TextInput value={editVehicleTransmissionInput} onChangeText={setEditVehicleTransmissionInput} style={styles.input} placeholder="Transmisión: manual|automatic" autoCapitalize="none" />
              <TextInput value={editVehicleSeatsInput} onChangeText={setEditVehicleSeatsInput} style={styles.input} placeholder="Plazas" keyboardType="number-pad" />
              <TextInput value={editVehicleStatusInput} onChangeText={(value) => setEditVehicleStatusInput(value === 'inactive' ? 'inactive' : 'active')} style={styles.input} placeholder="Estado: active|inactive" autoCapitalize="none" />

              <View style={styles.actionsRow}>
                <View style={styles.actionButtonWrapper}>
                  <Button title="Guardar cambios" onPress={handleUpdateVehicle} disabled={vehiclesCreating} />
                </View>
                <View style={styles.actionButtonWrapper}>
                  <Button title="Eliminar" onPress={handleDeleteVehicle} color="#b00020" disabled={vehiclesCreating} />
                </View>
              </View>

              <View style={styles.actionsRow}>
                <View style={styles.actionButtonWrapper}>
                  <Button title="Imágenes" onPress={handleOpenVehicleImagesScreen} disabled={vehiclesCreating} />
                </View>
                <View style={styles.actionButtonWrapper}>
                  <Button title="Ventanas" onPress={handleOpenAvailabilityScreen} disabled={vehiclesCreating} />
                </View>
              </View>
            </View>

            {vehiclesCreating ? <ActivityIndicator size="small" /> : null}
            {vehiclesMutationMessage ? <Text style={styles.info}>{vehiclesMutationMessage}</Text> : null}
            {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
          </View>
        );
      }

      return (
        <View style={styles.sectionCard}>
          <Text style={styles.title}>Mis Vehículos</Text>
          <Text style={styles.subtitle}>Alta, edición, fotos y disponibilidad de tus vehículos.</Text>

          <View style={styles.card}>
            <Text style={styles.switcherTitle}>Nuevo vehículo (usuario activo)</Text>

            <TextInput value={vehicleBrandInput} onChangeText={setVehicleBrandInput} style={styles.input} placeholder="Marca" />
            <TextInput value={vehicleModelInput} onChangeText={setVehicleModelInput} style={styles.input} placeholder="Modelo" />
            <TextInput
              value={vehicleYearInput}
              onChangeText={setVehicleYearInput}
              style={styles.input}
              placeholder="Año"
              keyboardType="number-pad"
            />
            <TextInput
              value={vehicleLicensePlateInput}
              onChangeText={setVehicleLicensePlateInput}
              style={styles.input}
              placeholder="Matrícula"
              autoCapitalize="characters"
            />
            <TextInput
              value={vehicleDescriptionInput}
              onChangeText={setVehicleDescriptionInput}
              style={styles.input}
              placeholder="Descripción"
            />
            <TextInput
              value={vehiclePricePerDayInput}
              onChangeText={setVehiclePricePerDayInput}
              style={styles.input}
              placeholder="Precio por día"
              keyboardType="decimal-pad"
            />
            <TextInput
              value={vehicleLatInput}
              onChangeText={setVehicleLatInput}
              style={styles.input}
              placeholder="Latitud"
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              value={vehicleLngInput}
              onChangeText={setVehicleLngInput}
              style={styles.input}
              placeholder="Longitud"
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              value={vehicleAddressInput}
              onChangeText={setVehicleAddressInput}
              style={styles.input}
              placeholder="Dirección"
            />
            <TextInput
              value={vehicleFuelTypeInput}
              onChangeText={setVehicleFuelTypeInput}
              style={styles.input}
              placeholder="Combustible: gasoline|diesel|electric|hybrid"
              autoCapitalize="none"
            />
            <TextInput
              value={vehicleTransmissionInput}
              onChangeText={setVehicleTransmissionInput}
              style={styles.input}
              placeholder="Transmisión: manual|automatic"
              autoCapitalize="none"
            />
            <TextInput
              value={vehicleSeatsInput}
              onChangeText={setVehicleSeatsInput}
              style={styles.input}
              placeholder="Plazas"
              keyboardType="number-pad"
            />

            <View style={styles.buttonContainer}>
              <Button
                title="Crear vehículo (usuario activo)"
                onPress={handleCreateVehicle}
                disabled={vehiclesCreating}
              />
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <Button title="Recargar" onPress={() => fetchVehicles()} />
          </View>

          {vehiclesLoading || vehiclesCreating ? <ActivityIndicator size="small" /> : null}
          {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
          {vehiclesMutationMessage ? <Text style={styles.info}>{vehiclesMutationMessage}</Text> : null}

          {myVehicles.map((vehicle) => (
            <Pressable key={vehicle.id} style={styles.card} onPress={() => handleOpenVehicleEditor(vehicle.id)}>
              <Text style={styles.row}><Text style={styles.label}>Vehículo:</Text> {vehicle.brand} {vehicle.model}</Text>
              <Text style={styles.row}><Text style={styles.label}>Matrícula:</Text> {vehicle.licensePlate}</Text>
              <Text style={styles.row}><Text style={styles.label}>Precio/día:</Text> {vehicle.pricePerDay.toFixed(2)} €</Text>
              <Text style={styles.row}><Text style={styles.label}>Estado:</Text> {vehicle.status}</Text>
              <Text style={styles.linkHint}>Toca para editar, fotos o disponibilidad</Text>
            </Pressable>
          ))}

          {!vehiclesLoading && !vehiclesError && myVehicles.length === 0 ? (
            <Text style={styles.subtitle}>Este usuario no tiene vehículos asociados.</Text>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.sectionCard}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.subtitle}>Datos personales, documentación y acciones CRUD.</Text>

        <View style={styles.profileHeaderCard}>
          {resolvedProfileAvatarUrl ? (
            <Image source={{ uri: resolvedProfileAvatarUrl }} style={styles.avatarCircleImage} resizeMode="cover" />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>
                {(firstNameInput[0] ?? '?').toUpperCase()}
                {(lastNameInput[0] ?? '').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.profileHeaderInfo}>
            <Text style={styles.profileName}>{firstNameInput || 'Nombre'} {lastNameInput || 'Apellido'}</Text>
            <Text style={styles.profileMeta}>ID: {selectedUserId}</Text>
            <Text style={styles.profileMeta}>Estado verificación: {profile?.isVerified ? 'Verificado' : 'Pendiente'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.switcherTitle}>Autenticacion Supabase</Text>
          <TextInput
            value={emailInput}
            onChangeText={setEmailInput}
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            value={passwordInput}
            onChangeText={setPasswordInput}
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.actionsRow}>
            <View style={styles.actionButtonWrapper}>
              <Button title="Login" onPress={signIn} disabled={authLoading} />
            </View>
            <View style={styles.actionButtonWrapper}>
              <Button title="Registro" onPress={signUp} disabled={authLoading} />
            </View>
            <View style={styles.actionButtonWrapper}>
              <Button title="Logout" onPress={signOut} disabled={authLoading || !authUserId} />
            </View>
          </View>

          {authLoading ? <ActivityIndicator size="small" /> : null}
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          {authMessage ? <Text style={styles.info}>{authMessage}</Text> : null}
          <Text style={styles.row}><Text style={styles.label}>Sesion:</Text> {authUserId ? 'Autenticada' : 'No autenticada'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Auth user:</Text> {authUserId ?? 'N/A'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Email:</Text> {authEmail ?? 'N/A'}</Text>

          <View style={styles.buttonContainer}>
            <Button title="Cargar /users/me" onPress={fetchMyProfile} disabled={!authUserId || authLoading} />
          </View>
        </View>

        <View style={styles.formGrid}>
          <TextInput
            value={firstNameInput}
            onChangeText={setFirstNameInput}
            style={styles.input}
            placeholder="Nombre"
          />
          <TextInput
            value={lastNameInput}
            onChangeText={setLastNameInput}
            style={styles.input}
            placeholder="Apellidos"
          />
          <TextInput
            value={phoneInput}
            onChangeText={setPhoneInput}
            style={styles.input}
            placeholder="Teléfono"
            keyboardType="phone-pad"
          />
          <TextInput
            value={avatarInput}
            onChangeText={setAvatarInput}
            style={styles.input}
            placeholder="URL avatar"
            autoCapitalize="none"
          />
          <TextInput
            value={idDocumentInput}
            onChangeText={setIdDocumentInput}
            style={styles.input}
            placeholder="URL DNI"
            autoCapitalize="none"
          />
          <TextInput
            value={driverLicenseInput}
            onChangeText={setDriverLicenseInput}
            style={styles.input}
            placeholder="URL carnet"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.formGrid}>
          <Button
            title={profileUploadingField === 'avatar' ? 'Subiendo avatar...' : 'Seleccionar y subir avatar'}
            onPress={() => handleUploadUserImage('avatar')}
            disabled={profileUploadingField !== null}
          />
          <Button
            title={
              profileUploadingField === 'id_document'
                ? 'Subiendo DNI...'
                : 'Seleccionar y subir DNI'
            }
            onPress={() => handleUploadUserImage('id_document')}
            disabled={profileUploadingField !== null}
          />
          <Button
            title={
              profileUploadingField === 'driver_license'
                ? 'Subiendo carnet...'
                : 'Seleccionar y subir carnet'
            }
            onPress={() => handleUploadUserImage('driver_license')}
            disabled={profileUploadingField !== null}
          />
        </View>

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Crear" onPress={handleCreateUser} disabled={saving} />
          </View>
          <View style={styles.actionButtonWrapper}>
            <Button title="Guardar" onPress={handleUpdateUser} disabled={saving} />
          </View>
          <View style={styles.actionButtonWrapper}>
            <Button title="Eliminar" onPress={handleDeleteUser} color="#b00020" disabled={saving} />
          </View>
        </View>

        {saving ? <ActivityIndicator size="small" /> : null}
        {mutationMessage ? <Text style={styles.info}>{mutationMessage}</Text> : null}
        {profileUploadMessage ? <Text style={styles.info}>{profileUploadMessage}</Text> : null}

        {profile ? (
          <View style={styles.card}>
            <Text style={styles.row}><Text style={styles.label}>ID:</Text> {profile.id}</Text>
            <Text style={styles.row}><Text style={styles.label}>Nombre:</Text> {profile.firstName} {profile.lastName}</Text>
            <Text style={styles.row}><Text style={styles.label}>Teléfono:</Text> {profile.phoneNumber ?? 'No definido'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Verificado:</Text> {profile.isVerified ? 'Sí' : 'No'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Avatar:</Text> {profile.avatarUrl ?? 'No definido'}</Text>
            {resolvedProfileAvatarUrl ? (
              <Image source={{ uri: resolvedProfileAvatarUrl }} style={styles.profileImagePreview} resizeMode="cover" />
            ) : null}
            <Text style={styles.row}><Text style={styles.label}>DNI:</Text> {profile.idDocumentUrl ?? 'No definido'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Carnet:</Text> {profile.driverLicenseUrl ?? 'No definido'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Alta:</Text> {new Date(profile.createdAt).toLocaleString('es-ES')}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={isDesktopLike ? styles.topNav : styles.hiddenNav}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.navButton, activeTab === tab.key ? styles.navButtonActive : undefined]}
          >
            <Text style={activeTab === tab.key ? styles.navLabelActive : styles.navLabel}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.content, !isDesktopLike ? styles.contentWithBottomBar : undefined]}>
        <View style={styles.userSwitcherCard}>
          <Text style={styles.switcherTitle}>Usuario activo para demo</Text>
          <TextInput
            value={selectedUserId}
            onChangeText={setSelectedUserId}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="UUID de usuario"
          />
          <View style={styles.buttonContainer}>
            <Button title="Aplicar usuario" onPress={handleReloadForSelectedUser} />
          </View>
          {loading ? <ActivityIndicator size="small" /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {profile ? (
            <Text style={styles.subtitle}>Sesión demo: {profile.firstName} {profile.lastName}</Text>
          ) : null}
        </View>

        {renderContent()}
      </ScrollView>

      {!isDesktopLike ? (
        <View style={styles.bottomNav}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.navButton, activeTab === tab.key ? styles.navButtonActive : undefined]}
            >
              <Text style={activeTab === tab.key ? styles.navLabelActive : styles.navLabel}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  content: {
    padding: 16
  },
  contentWithBottomBar: {
    paddingBottom: 96
  },
  sectionCard: {
    gap: 12
  },
  userSwitcherCard: {
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10
  },
  switcherTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  title: {
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 14,
    color: '#555'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  buttonContainer: {
    alignSelf: 'flex-start'
  },
  card: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  row: {
    fontSize: 14
  },
  label: {
    fontWeight: '600'
  },
  error: {
    color: '#b00020',
    fontSize: 13
  },
  info: {
    color: '#0a6c00',
    fontSize: 13
  },
  profileHeaderCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarCircleImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f0'
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700'
  },
  profileHeaderInfo: {
    flex: 1,
    gap: 2
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700'
  },
  profileMeta: {
    fontSize: 12,
    color: '#666'
  },
  formGrid: {
    gap: 8
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionButtonWrapper: {
    minWidth: 88
  },
  linkHint: {
    fontSize: 12,
    color: '#666'
  },
  profileImagePreview: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#eee'
  },
  vehicleImagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#eee'
  },
  topNav: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#ddd'
  },
  hiddenNav: {
    display: 'none'
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff'
  },
  navButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8
  },
  navButtonActive: {
    borderWidth: 1,
    borderColor: '#222'
  },
  navLabel: {
    fontSize: 13
  },
  navLabelActive: {
    fontSize: 13,
    fontWeight: '700'
  }
});
