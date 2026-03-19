import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { uploadImageToApi } from '../../api/uploads';
import { styles } from '../../app/styles';
import { parseLocaleNumber } from '../../shared/number';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { useAuthStore } from '../../store/useAuthStore';
import { useVehicleAvailabilityWindowsStore } from '../../store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../../store/useVehicleImagesStore';
import { useVehiclesStore } from '../../store/useVehiclesStore';

type MyVehiclesScreenMode = 'list' | 'edit' | 'images' | 'availability';

export function MyVehiclesScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const desktopCardStyle = isDesktopWeb ? localStyles.desktopCard : undefined;

  const [screenMode, setScreenMode] = useState<MyVehiclesScreenMode>('list');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleImageUploading, setVehicleImageUploading] = useState(false);
  const [editingAvailabilityWindowId, setEditingAvailabilityWindowId] = useState<string | null>(null);

  const [vehicleBrandInput, setVehicleBrandInput] = useState('Toyota');
  const [vehicleModelInput, setVehicleModelInput] = useState('Corolla');
  const [vehicleYearInput, setVehicleYearInput] = useState('2020');
  const [vehicleLicensePlateInput, setVehicleLicensePlateInput] = useState('1234ABC');
  const [vehicleDescriptionInput, setVehicleDescriptionInput] = useState('Vehiculo de prueba para el TFG.');
  const [vehiclePricePerDayInput, setVehiclePricePerDayInput] = useState('45');
  const [vehicleLatInput, setVehicleLatInput] = useState('40.4168');
  const [vehicleLngInput, setVehicleLngInput] = useState('-3.7038');
  const [vehicleAddressInput, setVehicleAddressInput] = useState('Madrid Centro');
  const [vehicleFuelTypeInput, setVehicleFuelTypeInput] = useState('hybrid');
  const [vehicleTransmissionInput, setVehicleTransmissionInput] = useState('automatic');
  const [vehicleSeatsInput, setVehicleSeatsInput] = useState('5');

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

  const editingVehicle = useMemo(
    () => myVehicles.find((vehicle) => vehicle.id === editingVehicleId) ?? null,
    [myVehicles, editingVehicleId]
  );
  const imageByVehicleId = useVehiclePrimaryImages(myVehicles.map((vehicle) => vehicle.id));

  useEffect(() => {
    if (!authUserId) {
      return;
    }

    void fetchMyVehicles();
  }, [authUserId, fetchMyVehicles]);

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

    await createVehicle({
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

    await fetchMyVehicles();
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
    setScreenMode('edit');
  };

  const handleBack = () => {
    if (screenMode === 'edit') {
      setEditingVehicleId(null);
      setScreenMode('list');
      return;
    }

    setScreenMode('edit');
  };

  const handleOpenVehicleImagesScreen = async () => {
    if (!editingVehicleId) {
      return;
    }

    setVehicleImageUrlInput('');
    setVehicleImageIsPrimaryInput('false');
    setScreenMode('images');
    await fetchVehicleImagesByVehicleId(editingVehicleId);
  };

  const handleOpenAvailabilityScreen = async () => {
    if (!editingVehicleId) {
      return;
    }

    setAvailabilityStartInput('');
    setAvailabilityEndInput('');
    setEditingAvailabilityWindowId(null);
    setScreenMode('availability');
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

    await fetchMyVehicles();
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

      await createVehicleImageForVehicle(editingVehicleId, uploaded.persistedValue, isPrimary);
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

  const handleSelectAvailabilityWindowForEdit = (
    windowId: string,
    startDatetime: string,
    endDatetime: string
  ) => {
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

  if (editingVehicle && editingVehicleId && screenMode === 'images') {
    return (
      <View style={styles.sectionCard}>
        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Volver" onPress={handleBack} />
          </View>
        </View>

        <Text style={styles.title}>Imagenes del Vehiculo</Text>
        <Text style={styles.subtitle}>Alta, lectura y borrado de fotos para {editingVehicle.brand} {editingVehicle.model}.</Text>

        <View style={[styles.card, desktopCardStyle]}>
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
              onPress={() => void handleCreateVehicleImage()}
              disabled={vehicleImagesSaving || vehicleImageUploading}
            />
          </View>

          <View style={styles.buttonContainer}>
            <Button
              title={vehicleImageUploading ? 'Subiendo imagen...' : 'Seleccionar, subir y crear'}
              onPress={() => void handlePickUploadAndCreateVehicleImage()}
              disabled={vehicleImagesSaving || vehicleImageUploading}
            />
          </View>
        </View>

        {vehicleImagesLoading || vehicleImagesSaving || vehicleImageUploading ? (
          <ActivityIndicator size="small" />
        ) : null}
        {vehicleImagesError ? <Text style={styles.error}>{vehicleImagesError}</Text> : null}
        {vehicleImagesMutationMessage ? <Text style={styles.info}>{vehicleImagesMutationMessage}</Text> : null}

        {vehicleImages.map((image) => (
          <View key={image.id} style={[styles.card, desktopCardStyle]}>
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
            <Text style={styles.row}><Text style={styles.label}>Principal:</Text> {image.isPrimary ? 'Si' : 'No'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Alta:</Text> {new Date(image.createdAt).toLocaleString('es-ES')}</Text>
            <View style={styles.buttonContainer}>
              <Button
                title="Eliminar imagen"
                onPress={() => void handleDeleteVehicleImage(image.id)}
                color="#b00020"
                disabled={vehicleImagesSaving}
              />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (!authUserId) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.title}>Mis Vehiculos</Text>
        <Text style={styles.subtitle}>Inicia sesion para gestionar tus vehiculos.</Text>
      </View>
    );
  }

  if (editingVehicle && editingVehicleId && screenMode === 'availability') {
    return (
      <View style={styles.sectionCard}>
        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Volver" onPress={handleBack} />
          </View>
        </View>

        <Text style={styles.title}>Ventanas de Disponibilidad</Text>
        <Text style={styles.subtitle}>CRUD de ventanas para {editingVehicle.brand} {editingVehicle.model}.</Text>

        <View style={[styles.card, desktopCardStyle]}>
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
                onPress={() => void handleSaveAvailabilityWindow()}
                disabled={availabilityWindowsSaving}
              />
            </View>
            {editingAvailabilityWindowId ? (
              <View style={styles.actionButtonWrapper}>
                <Button
                  title="Cancelar edicion"
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
          <View key={window.id} style={[styles.card, desktopCardStyle]}>
            <Text style={styles.row}><Text style={styles.label}>ID:</Text> {window.id}</Text>
            <Text style={styles.row}><Text style={styles.label}>Inicio:</Text> {new Date(window.startDatetime).toLocaleString('es-ES')}</Text>
            <Text style={styles.row}><Text style={styles.label}>Fin:</Text> {new Date(window.endDatetime).toLocaleString('es-ES')}</Text>
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrapper}>
                <Button
                  title="Editar"
                  onPress={() =>
                    handleSelectAvailabilityWindowForEdit(window.id, window.startDatetime, window.endDatetime)
                  }
                  disabled={availabilityWindowsSaving}
                />
              </View>
              <View style={styles.actionButtonWrapper}>
                <Button
                  title="Eliminar"
                  color="#b00020"
                  onPress={() => void handleDeleteAvailabilityWindow(window.id)}
                  disabled={availabilityWindowsSaving}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (editingVehicle && editingVehicleId) {
    return (
      <View style={styles.sectionCard}>
        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrapper}>
            <Button title="Volver" onPress={handleBack} />
          </View>
        </View>

        <Text style={styles.title}>Editar Vehiculo</Text>
        <Text style={styles.subtitle}>Edicion, borrado, imagenes y disponibilidad.</Text>

        <View style={[styles.card, desktopCardStyle]}>
          <TextInput value={editVehicleBrandInput} onChangeText={setEditVehicleBrandInput} style={styles.input} placeholder="Marca" />
          <TextInput value={editVehicleModelInput} onChangeText={setEditVehicleModelInput} style={styles.input} placeholder="Modelo" />
          <TextInput value={editVehicleYearInput} onChangeText={setEditVehicleYearInput} style={styles.input} placeholder="Ano" keyboardType="number-pad" />
          <TextInput value={editVehicleLicensePlateInput} onChangeText={setEditVehicleLicensePlateInput} style={styles.input} placeholder="Matricula" autoCapitalize="characters" />
          <TextInput value={editVehicleDescriptionInput} onChangeText={setEditVehicleDescriptionInput} style={styles.input} placeholder="Descripcion" />
          <TextInput value={editVehiclePricePerDayInput} onChangeText={setEditVehiclePricePerDayInput} style={styles.input} placeholder="Precio por dia" keyboardType="decimal-pad" />
          <TextInput value={editVehicleLatInput} onChangeText={setEditVehicleLatInput} style={styles.input} placeholder="Latitud" keyboardType="numbers-and-punctuation" />
          <TextInput value={editVehicleLngInput} onChangeText={setEditVehicleLngInput} style={styles.input} placeholder="Longitud" keyboardType="numbers-and-punctuation" />
          <TextInput value={editVehicleAddressInput} onChangeText={setEditVehicleAddressInput} style={styles.input} placeholder="Direccion" />
          <TextInput value={editVehicleFuelTypeInput} onChangeText={setEditVehicleFuelTypeInput} style={styles.input} placeholder="Combustible" autoCapitalize="none" />
          <TextInput value={editVehicleTransmissionInput} onChangeText={setEditVehicleTransmissionInput} style={styles.input} placeholder="Transmision" autoCapitalize="none" />
          <TextInput value={editVehicleSeatsInput} onChangeText={setEditVehicleSeatsInput} style={styles.input} placeholder="Plazas" keyboardType="number-pad" />
          <TextInput value={editVehicleStatusInput} onChangeText={(value) => setEditVehicleStatusInput(value === 'inactive' ? 'inactive' : 'active')} style={styles.input} placeholder="Estado: active|inactive" autoCapitalize="none" />

          <View style={styles.actionsRow}>
            <View style={styles.actionButtonWrapper}>
              <Button title="Guardar cambios" onPress={() => void handleUpdateVehicle()} disabled={vehiclesCreating} />
            </View>
            <View style={styles.actionButtonWrapper}>
              <Button title="Eliminar" onPress={() => void handleDeleteVehicle()} color="#b00020" disabled={vehiclesCreating} />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <View style={styles.actionButtonWrapper}>
              <Button title="Imagenes" onPress={() => void handleOpenVehicleImagesScreen()} disabled={vehiclesCreating} />
            </View>
            <View style={styles.actionButtonWrapper}>
              <Button title="Ventanas" onPress={() => void handleOpenAvailabilityScreen()} disabled={vehiclesCreating} />
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
      <Text style={styles.title}>Mis Vehiculos</Text>
      <Text style={styles.subtitle}>Alta, edicion, fotos y disponibilidad de tus vehiculos.</Text>

      <View style={[styles.card, desktopCardStyle]}>
        <Text style={styles.switcherTitle}>Nuevo vehiculo (usuario activo)</Text>

        <TextInput value={vehicleBrandInput} onChangeText={setVehicleBrandInput} style={styles.input} placeholder="Marca" />
        <TextInput value={vehicleModelInput} onChangeText={setVehicleModelInput} style={styles.input} placeholder="Modelo" />
        <TextInput value={vehicleYearInput} onChangeText={setVehicleYearInput} style={styles.input} placeholder="Ano" keyboardType="number-pad" />
        <TextInput value={vehicleLicensePlateInput} onChangeText={setVehicleLicensePlateInput} style={styles.input} placeholder="Matricula" autoCapitalize="characters" />
        <TextInput value={vehicleDescriptionInput} onChangeText={setVehicleDescriptionInput} style={styles.input} placeholder="Descripcion" />
        <TextInput value={vehiclePricePerDayInput} onChangeText={setVehiclePricePerDayInput} style={styles.input} placeholder="Precio por dia" keyboardType="decimal-pad" />
        <TextInput value={vehicleLatInput} onChangeText={setVehicleLatInput} style={styles.input} placeholder="Latitud" keyboardType="numbers-and-punctuation" />
        <TextInput value={vehicleLngInput} onChangeText={setVehicleLngInput} style={styles.input} placeholder="Longitud" keyboardType="numbers-and-punctuation" />
        <TextInput value={vehicleAddressInput} onChangeText={setVehicleAddressInput} style={styles.input} placeholder="Direccion" />
        <TextInput value={vehicleFuelTypeInput} onChangeText={setVehicleFuelTypeInput} style={styles.input} placeholder="Combustible" autoCapitalize="none" />
        <TextInput value={vehicleTransmissionInput} onChangeText={setVehicleTransmissionInput} style={styles.input} placeholder="Transmision" autoCapitalize="none" />
        <TextInput value={vehicleSeatsInput} onChangeText={setVehicleSeatsInput} style={styles.input} placeholder="Plazas" keyboardType="number-pad" />

        <View style={styles.buttonContainer}>
          <Button title="Crear vehiculo" onPress={() => void handleCreateVehicle()} disabled={vehiclesCreating} />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Recargar" onPress={() => void fetchMyVehicles()} />
      </View>

      {vehiclesLoading || vehiclesCreating ? <ActivityIndicator size="small" /> : null}
      {vehiclesError ? <Text style={styles.error}>{vehiclesError}</Text> : null}
      {vehiclesMutationMessage ? <Text style={styles.info}>{vehiclesMutationMessage}</Text> : null}

      {myVehicles.map((vehicle) => (
        <Pressable key={vehicle.id} style={[styles.card, desktopCardStyle]} onPress={() => handleOpenVehicleEditor(vehicle.id)}>
          {resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null) ? (
            <Image
              source={{ uri: resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null) ?? '' }}
              style={styles.vehicleCardMedia}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.vehicleCardMediaPlaceholder}>
              <Text style={styles.vehicleCardMediaPlaceholderText}>Sube una foto para destacar tu anuncio</Text>
            </View>
          )}
          <Text style={styles.cardTitle}>{vehicle.brand} {vehicle.model}</Text>
          <Text style={styles.row}><Text style={styles.label}>Matricula:</Text> {vehicle.licensePlate}</Text>
          <Text style={styles.row}><Text style={styles.label}>Precio/dia:</Text> {vehicle.pricePerDay.toFixed(2)} EUR</Text>
          <Text style={styles.row}><Text style={styles.label}>Estado:</Text> {vehicle.status}</Text>
          <Text style={styles.linkHint}>Toca para editar, fotos o disponibilidad</Text>
        </Pressable>
      ))}

      {!vehiclesLoading && !vehiclesError && myVehicles.length === 0 ? (
        <Text style={styles.subtitle}>Este usuario no tiene vehiculos asociados.</Text>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  desktopCard: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center'
  }
});
