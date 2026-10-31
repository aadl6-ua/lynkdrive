import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { uploadImageToApi } from '../../api/uploads';
import {
  colorTokens,
  layoutTokens,
  radiusTokens,
  shadowTokens,
  spacingTokens,
  typographyTokens
} from '../../app/theme/tokens';
import { AppTabKey } from '../../app/types';
import { AddressSearch } from '../../shared/components/AddressSearch';
import { getApiErrorMessage } from '../../shared/errors';
import {
  calendarDayHourToIso,
  formatDateTimeMadrid,
  formatPriceCompact,
  isoToCalendarDayHour,
  pluralize,
  translateFuelType,
  translateTransmission
} from '../../shared/format';
import { ImagePermissionError, ImageSource, pickImages } from '../../shared/imagePicker';
import { parseLocaleNumber } from '../../shared/number';
import {
  AppImage,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineMessage,
  PhotoGrid,
  PhotoItem,
  Screen,
  ScreenHeader,
  SectionTitle,
  SelectField,
  Skeleton,
  StatusChip,
  TextField,
  VehicleCardSkeleton,
  confirmAction,
  toast
} from '../../shared/ui';
import { useBackHandler } from '../../shared/useBackHandler';
import { useVehiclePrimaryImages } from '../../shared/useVehiclePrimaryImages';
import { useAuthStore } from '../../store/useAuthStore';
import { useVehicleAvailabilityWindowsStore } from '../../store/useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../../store/useVehicleImagesStore';
import { VehicleItem, useVehiclesStore } from '../../store/useVehiclesStore';
import { CalendarPicker } from '../explore/CalendarPicker';

type MyVehiclesScreenMode = 'list' | 'create' | 'edit' | 'images' | 'availability';

type MyVehiclesScreenProps = {
  topPadding?: number;
  bottomPadding?: number;
  onNavigateToTab?: (tab: AppTabKey) => void;
};

type FuelType = NonNullable<VehicleItem['fuelType']>;
type Transmission = NonNullable<VehicleItem['transmission']>;

type VehicleForm = {
  brand: string;
  model: string;
  year: string;
  licensePlate: string;
  description: string;
  pricePerDay: string;
  address: string;
  location: { lat: number; lng: number } | null;
  fuelType: '' | FuelType;
  transmission: '' | Transmission;
  seats: string;
};

type VehicleFormErrors = Partial<Record<keyof VehicleForm, string>>;

type AvailabilityDateRange = {
  startDate: Date | null;
  startHour: number;
  endDate: Date | null;
  endHour: number;
};

/** Subida local en curso (optimizando, subiendo o con error para reintentar). */
type UploadItem = {
  key: string;
  asset: Parameters<typeof prepareUploadImage>[0];
  previewUri: string;
  status: 'processing' | 'uploading' | 'error';
  progress?: number;
  errorMessage?: string;
};

const FUEL_TYPE_OPTIONS: Array<{ label: string; value: '' | FuelType }> = [
  { label: 'Sin especificar', value: '' },
  { label: 'Gasolina', value: 'gasoline' },
  { label: 'Diésel', value: 'diesel' },
  { label: 'Eléctrico', value: 'electric' },
  { label: 'Híbrido', value: 'hybrid' }
];

const TRANSMISSION_OPTIONS: Array<{ label: string; value: '' | Transmission }> = [
  { label: 'Sin especificar', value: '' },
  { label: 'Manual', value: 'manual' },
  { label: 'Automático', value: 'automatic' }
];

const SEATS_OPTIONS = [
  { label: 'Sin especificar', value: '' },
  ...['2', '3', '4', '5', '6', '7', '8', '9'].map((value) => ({ label: `${value} plazas`, value }))
];

const MAX_VEHICLE_PHOTOS = 12;
const CURRENT_YEAR = new Date().getFullYear();

const EMPTY_FORM: VehicleForm = {
  brand: '',
  model: '',
  year: '',
  licensePlate: '',
  description: '',
  pricePerDay: '',
  address: '',
  location: null,
  fuelType: '',
  transmission: '',
  seats: ''
};

let uploadSeq = 0;

function formFromVehicle(vehicle: VehicleItem): VehicleForm {
  return {
    brand: vehicle.brand,
    model: vehicle.model,
    year: String(vehicle.year),
    licensePlate: vehicle.licensePlate,
    description: vehicle.description,
    pricePerDay: String(vehicle.pricePerDay).replace('.', ','),
    address: vehicle.locationAddress,
    location: { lat: vehicle.locationLat, lng: vehicle.locationLng },
    fuelType: vehicle.fuelType ?? '',
    transmission: vehicle.transmission ?? '',
    seats: vehicle.seats !== null ? String(vehicle.seats) : ''
  };
}

function validateVehicleForm(form: VehicleForm): VehicleFormErrors {
  const errors: VehicleFormErrors = {};
  const year = parseLocaleNumber(form.year);
  const price = parseLocaleNumber(form.pricePerDay);

  if (!form.brand.trim()) errors.brand = 'Indica la marca.';
  if (!form.model.trim()) errors.model = 'Indica el modelo.';
  if (!form.year.trim()) {
    errors.year = 'Indica el año.';
  } else if (!Number.isInteger(year) || year < 1950 || year > CURRENT_YEAR + 1) {
    errors.year = `Entre 1950 y ${CURRENT_YEAR + 1}.`;
  }
  if (!form.pricePerDay.trim()) {
    errors.pricePerDay = 'Indica el precio.';
  } else if (Number.isNaN(price) || price < 1) {
    errors.pricePerDay = 'Debe ser de al menos 1 €.';
  } else if (price > 10000) {
    errors.pricePerDay = 'Máximo 10.000 € por día.';
  }
  if (!form.licensePlate.trim()) errors.licensePlate = 'Indica la matrícula.';
  if (!form.description.trim()) {
    errors.description = 'Describe el vehículo para generar confianza.';
  }
  if (!form.address.trim()) {
    errors.address = 'Indica dónde se recoge el vehículo.';
  } else if (!form.location) {
    errors.address = 'Elige una de las direcciones sugeridas.';
  }

  return errors;
}

function emptyAvailabilitySelection(): AvailabilityDateRange {
  return { startDate: null, startHour: 10, endDate: null, endHour: 18 };
}

export function MyVehiclesScreen({ topPadding = 0, bottomPadding = 0, onNavigateToTab }: MyVehiclesScreenProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const [screenMode, setScreenMode] = useState<MyVehiclesScreenMode>('list');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<VehicleFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [editingAvailabilityWindowId, setEditingAvailabilityWindowId] = useState<string | null>(null);
  const [availabilityRange, setAvailabilityRange] = useState<{ start: string; end: string } | null>(null);
  const [initialAvailabilitySelection, setInitialAvailabilitySelection] = useState<AvailabilityDateRange>(
    emptyAvailabilitySelection()
  );
  const [calendarKey, setCalendarKey] = useState(0);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const {
    myItems: myVehicles,
    myLoading: vehiclesLoading,
    myLoaded: vehiclesLoaded,
    myError: vehiclesError,
    creating: vehiclesSaving,
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

  const futureWindows = useMemo(
    () =>
      availabilityWindows
        .filter((window) => new Date(window.endDatetime).getTime() > Date.now())
        .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()),
    [availabilityWindows]
  );

  // Columnas del listado según ancho (centrado con ancho máximo).
  const contentWidth = Math.min(width - spacingTokens.lg * 2, layoutTokens.contentMaxWidth);
  const columns = contentWidth >= 960 ? 3 : contentWidth >= 600 ? 2 : 1;
  const cardWidth = Math.floor((contentWidth - spacingTokens.lg * (columns - 1)) / columns);

  useEffect(() => {
    if (authUserId) {
      void fetchMyVehicles();
    }
  }, [authUserId, fetchMyVehicles]);

  const updateForm = <K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  const isFormDirty = useMemo(() => {
    if (screenMode === 'create') {
      return JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
    }

    return !!editingVehicle && JSON.stringify(form) !== JSON.stringify(formFromVehicle(editingVehicle));
  }, [form, screenMode, editingVehicle]);

  const buildPayload = (status: VehicleItem['status']) => {
    const seats = parseLocaleNumber(form.seats);

    return {
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: parseLocaleNumber(form.year),
      licensePlate: form.licensePlate.trim().toUpperCase(),
      description: form.description.trim(),
      pricePerDay: parseLocaleNumber(form.pricePerDay),
      locationLat: form.location?.lat ?? 0,
      locationLng: form.location?.lng ?? 0,
      locationAddress: form.address.trim(),
      fuelType: form.fuelType || null,
      transmission: form.transmission || null,
      seats: Number.isNaN(seats) ? null : seats,
      status
    };
  };

  const showStoreError = (fallback: string) => {
    setFormError(useVehiclesStore.getState().mutationMessage ?? fallback);
  };

  const handleCreateVehicle = async () => {
    const errors = validateVehicleForm(form);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setFormError('Revisa los campos marcados.');
      return;
    }

    const ok = await createVehicle(buildPayload('active'));

    if (!ok) {
      showStoreError('No se pudo publicar el vehículo.');
      return;
    }

    toast.success('Vehículo publicado. Añade fotos y disponibilidad para recibir reservas.');
    setForm(EMPTY_FORM);
    setFormErrors({});
    setScreenMode('list');
  };

  const handleOpenVehicleEditor = (vehicleId: string) => {
    const vehicle = myVehicles.find((item) => item.id === vehicleId);

    if (!vehicle) {
      return;
    }

    setEditingVehicleId(vehicle.id);
    setForm(formFromVehicle(vehicle));
    setFormErrors({});
    setFormError(null);
    setScreenMode('edit');
    void fetchVehicleImagesByVehicleId(vehicle.id);
    void fetchAvailabilityWindowsByVehicleId(vehicle.id);
  };

  const handleUpdateVehicle = async () => {
    if (!editingVehicle) {
      return;
    }

    const errors = validateVehicleForm(form);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setFormError('Revisa los campos marcados.');
      return;
    }

    const ok = await updateVehicleById(editingVehicle.id, buildPayload(editingVehicle.status));

    if (!ok) {
      showStoreError('No se pudieron guardar los cambios.');
      return;
    }

    toast.success('Cambios guardados.');
  };

  const handleToggleStatus = async (active: boolean) => {
    if (!editingVehicle) {
      return;
    }

    setStatusSaving(true);
    // Solo cambia la visibilidad: se envían los datos guardados, no el borrador del formulario.
    const ok = await updateVehicleById(editingVehicle.id, {
      brand: editingVehicle.brand,
      model: editingVehicle.model,
      year: editingVehicle.year,
      licensePlate: editingVehicle.licensePlate,
      description: editingVehicle.description,
      pricePerDay: editingVehicle.pricePerDay,
      locationLat: editingVehicle.locationLat,
      locationLng: editingVehicle.locationLng,
      locationAddress: editingVehicle.locationAddress,
      fuelType: editingVehicle.fuelType,
      transmission: editingVehicle.transmission,
      seats: editingVehicle.seats,
      status: active ? 'active' : 'inactive'
    });
    setStatusSaving(false);

    if (ok) {
      toast.success(active ? 'Tu vehículo vuelve a ser visible.' : 'Vehículo oculto de Explorar.');
    } else {
      toast.error(useVehiclesStore.getState().mutationMessage ?? 'No se pudo cambiar la visibilidad.');
    }
  };

  const handleDeleteVehicle = async () => {
    if (!editingVehicle) {
      return;
    }

    const confirmed = await confirmAction({
      title: '¿Eliminar este vehículo?',
      message: `${editingVehicle.brand} ${editingVehicle.model} dejará de estar publicado. Si tiene reservas asociadas no podrá eliminarse.`,
      confirmLabel: 'Eliminar',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    const ok = await deleteVehicleById(editingVehicle.id);

    if (!ok) {
      toast.error(useVehiclesStore.getState().mutationMessage ?? 'No se pudo eliminar el vehículo.');
      return;
    }

    toast.success('Vehículo eliminado.');
    setEditingVehicleId(null);
    setScreenMode('list');
  };

  const handleBack = useCallback(async () => {
    if ((screenMode === 'create' || screenMode === 'edit') && isFormDirty) {
      const confirmed = await confirmAction({
        title: '¿Salir sin guardar?',
        message: 'Perderás los cambios que no has guardado.',
        confirmLabel: 'Salir',
        cancelLabel: 'Seguir editando',
        destructive: true
      });

      if (!confirmed) {
        return;
      }
    }

    if (screenMode === 'images' || screenMode === 'availability') {
      setScreenMode('edit');
      return;
    }

    setEditingVehicleId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
    setScreenMode('list');
  }, [screenMode, isFormDirty]);

  useBackHandler(screenMode !== 'list', () => void handleBack());

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMyVehicles();
    if (editingVehicleId && screenMode !== 'list') {
      await Promise.all([
        fetchVehicleImagesByVehicleId(editingVehicleId),
        fetchAvailabilityWindowsByVehicleId(editingVehicleId)
      ]);
    }
    setRefreshing(false);
  };

  /* --------------------------------- Fotos --------------------------------- */

  const runUpload = useCallback(
    async (item: UploadItem, vehicleId: string) => {
      const update = (patch: Partial<UploadItem>) =>
        setUploads((current) => current.map((entry) => (entry.key === item.key ? { ...entry, ...patch } : entry)));

      try {
        update({ status: 'processing', errorMessage: undefined, progress: undefined });
        const prepared = await prepareUploadImage(item.asset, 'vehicle_image');
        update({ status: 'uploading', progress: 0, previewUri: prepared.fileUri });

        const uploaded = await uploadImageToApi({
          target: 'vehicle_image',
          ownerId: vehicleId,
          fileUri: prepared.fileUri,
          fileName: prepared.fileName,
          mimeType: prepared.mimeType,
          webFile: prepared.webFile,
          onProgress: (fraction) => update({ progress: fraction })
        });

        // La primera foto del anuncio pasa a ser la portada.
        const isFirst = useVehicleImagesStore.getState().items.length === 0;
        const ok = await createVehicleImageForVehicle(vehicleId, uploaded.persistedValue, isFirst);

        if (!ok) {
          throw new Error(useVehicleImagesStore.getState().mutationMessage ?? 'No se pudo guardar la foto');
        }

        setUploads((current) => current.filter((entry) => entry.key !== item.key));
      } catch (uploadError: unknown) {
        update({
          status: 'error',
          errorMessage:
            uploadError instanceof Error && !('response' in uploadError)
              ? uploadError.message
              : getApiErrorMessage(uploadError, 'Error al subir')
        });
      }
    },
    [createVehicleImageForVehicle]
  );

  // Las subidas se encadenan una a una para respetar el orden y la portada.
  const enqueueUpload = useCallback(
    (item: UploadItem, vehicleId: string) => {
      uploadQueueRef.current = uploadQueueRef.current.then(() => runUpload(item, vehicleId));
    },
    [runUpload]
  );

  const handleAddPhotos = async (source: ImageSource) => {
    if (!editingVehicleId) {
      return;
    }

    const remaining = MAX_VEHICLE_PHOTOS - vehicleImages.length - uploads.length;

    try {
      const assets = await pickImages(source, { multiple: true, selectionLimit: remaining });
      const accepted = assets.slice(0, remaining);

      if (assets.length > accepted.length) {
        toast.info(`Máximo ${MAX_VEHICLE_PHOTOS} fotos por vehículo.`);
      }

      const items: UploadItem[] = accepted.map((asset) => ({
        key: `upload-${++uploadSeq}`,
        asset,
        previewUri: asset.uri,
        status: 'processing'
      }));

      setUploads((current) => [...current, ...items]);
      items.forEach((item) => enqueueUpload(item, editingVehicleId));
    } catch (pickError: unknown) {
      toast.error(
        pickError instanceof ImagePermissionError ? pickError.message : 'No se pudo abrir el selector de fotos.'
      );
    }
  };

  const photoItems: PhotoItem[] = useMemo(
    () => [
      ...[...vehicleImages]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((image) => ({
          key: image.id,
          uri: resolveStoredImageUrl(image.imageUrl),
          status: 'done' as const,
          isCover: image.isPrimary,
          privateLabel: 'Sin vista previa'
        })),
      ...uploads.map((upload) => ({
        key: upload.key,
        uri: upload.previewUri,
        status: upload.status,
        progress: upload.progress,
        errorMessage: upload.errorMessage
      }))
    ],
    [vehicleImages, uploads]
  );

  const handleRemovePhoto = async (item: PhotoItem) => {
    if (!editingVehicleId) {
      return;
    }

    const upload = uploads.find((entry) => entry.key === item.key);

    if (upload) {
      setUploads((current) => current.filter((entry) => entry.key !== item.key));
      return;
    }

    const confirmed = await confirmAction({
      title: '¿Eliminar esta foto?',
      message: item.isCover
        ? 'Es la portada del anuncio. Elige otra portada después de eliminarla.'
        : 'Se quitará de la galería del anuncio.',
      confirmLabel: 'Eliminar',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    const ok = await deleteVehicleImageById(item.key, editingVehicleId);
    if (ok) {
      toast.success('Foto eliminada.');
    } else {
      toast.error(useVehicleImagesStore.getState().mutationMessage ?? 'No se pudo eliminar la foto.');
    }
  };

  const handleSetCover = async (item: PhotoItem) => {
    if (!editingVehicleId) {
      return;
    }

    const ok = await updateVehicleImageById(item.key, editingVehicleId, { isPrimary: true });
    if (ok) {
      toast.success('Portada actualizada.');
    } else {
      toast.error(useVehicleImagesStore.getState().mutationMessage ?? 'No se pudo cambiar la portada.');
    }
  };

  /* ----------------------------- Disponibilidad ----------------------------- */

  const resetAvailabilityForm = () => {
    setEditingAvailabilityWindowId(null);
    setAvailabilityRange(null);
    setAvailabilityError(null);
    setInitialAvailabilitySelection(emptyAvailabilitySelection());
    setCalendarKey((key) => key + 1);
  };

  const handleOpenAvailabilityScreen = () => {
    if (!editingVehicleId) {
      return;
    }

    resetAvailabilityForm();
    setScreenMode('availability');
    void fetchAvailabilityWindowsByVehicleId(editingVehicleId);
  };

  const handleEditAvailabilityWindow = (windowId: string) => {
    const window = availabilityWindows.find((item) => item.id === windowId);
    const start = window ? isoToCalendarDayHour(window.startDatetime) : null;
    const end = window ? isoToCalendarDayHour(window.endDatetime) : null;

    if (!window || !start || !end) {
      return;
    }

    setEditingAvailabilityWindowId(windowId);
    setAvailabilityError(null);
    setInitialAvailabilitySelection({
      startDate: start.date,
      startHour: Math.min(20, Math.max(9, start.hour)),
      endDate: end.date,
      endHour: Math.min(20, Math.max(9, end.hour))
    });
  };

  const handleSaveAvailabilityWindow = async () => {
    if (!editingVehicleId) {
      return;
    }

    if (!availabilityRange) {
      setAvailabilityError('Elige fecha y hora de inicio y de fin.');
      return;
    }

    if (new Date(availabilityRange.end).getTime() <= new Date(availabilityRange.start).getTime()) {
      setAvailabilityError('El fin debe ser posterior al inicio.');
      return;
    }

    const ok = editingAvailabilityWindowId
      ? await updateAvailabilityWindowById(
          editingAvailabilityWindowId,
          editingVehicleId,
          availabilityRange.start,
          availabilityRange.end
        )
      : await createAvailabilityWindowForVehicle(editingVehicleId, availabilityRange.start, availabilityRange.end);

    if (!ok) {
      setAvailabilityError(
        useVehicleAvailabilityWindowsStore.getState().mutationMessage ?? 'No se pudo guardar la disponibilidad.'
      );
      return;
    }

    toast.success(editingAvailabilityWindowId ? 'Disponibilidad actualizada.' : 'Disponibilidad añadida.');
    resetAvailabilityForm();
  };

  const handleDeleteAvailabilityWindow = async (windowId: string) => {
    if (!editingVehicleId) {
      return;
    }

    const confirmed = await confirmAction({
      title: '¿Eliminar esta disponibilidad?',
      message: 'Los conductores ya no podrán reservar en esas fechas.',
      confirmLabel: 'Eliminar',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    const ok = await deleteAvailabilityWindowById(windowId, editingVehicleId);

    if (!ok) {
      toast.error(
        useVehicleAvailabilityWindowsStore.getState().mutationMessage ?? 'No se pudo eliminar la disponibilidad.'
      );
      return;
    }

    toast.success('Disponibilidad eliminada.');
    if (editingAvailabilityWindowId === windowId) {
      resetAvailabilityForm();
    }
  };

  const formScreenProps = { topPadding, bottomPadding, maxWidth: layoutTokens.formMaxWidth };

  /* ------------------------------------------------------------------------ */
  /* Fotos                                                                    */
  /* ------------------------------------------------------------------------ */

  if (editingVehicle && screenMode === 'images') {
    const uploadingCount = uploads.filter((item) => item.status !== 'error').length;

    return (
      <Screen
        {...formScreenProps}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        header={
          <ScreenHeader
            title="Fotos"
            eyebrow={`${editingVehicle.brand} ${editingVehicle.model}`}
            subtitle="Buenas fotos multiplican las reservas. La portada es la primera que ven los conductores."
            onBack={() => void handleBack()}
            backLabel="Volver al vehículo"
          />
        }
      >
        <Card>
          <CardHeader
            title="Galería"
            icon="images-outline"
            subtitle={`${pluralize(vehicleImages.length, 'foto', 'fotos')} de ${MAX_VEHICLE_PHOTOS}${
              uploadingCount ? ` · subiendo ${uploadingCount}` : ''
            }`}
          />
          {vehicleImagesLoading && vehicleImages.length === 0 ? (
            <View style={styles.photoSkeletons}>
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} width="31%" height={96} radius={radiusTokens.input} />
              ))}
            </View>
          ) : vehicleImagesError ? (
            <ErrorState
              message={vehicleImagesError}
              onRetry={() => void fetchVehicleImagesByVehicleId(editingVehicle.id)}
            />
          ) : (
            <PhotoGrid
              items={photoItems}
              onAdd={(source) => void handleAddPhotos(source)}
              onRemove={(item) => void handleRemovePhoto(item)}
              onRetry={(item) => {
                const upload = uploads.find((entry) => entry.key === item.key);
                if (upload) {
                  enqueueUpload(upload, editingVehicle.id);
                }
              }}
              onSetCover={(item) => void handleSetCover(item)}
              maxItems={MAX_VEHICLE_PHOTOS}
              disabled={vehicleImagesSaving}
              columns={isCompact ? 3 : 4}
            />
          )}
          <View style={styles.tipRow}>
            <Ionicons name="bulb-outline" size={16} color={colorTokens.accent2} />
            <Text style={styles.caption}>
              Usa la estrella para elegir la portada. Las fotos se optimizan automáticamente antes de subirse.
            </Text>
          </View>
        </Card>
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Disponibilidad                                                           */
  /* ------------------------------------------------------------------------ */

  if (editingVehicle && screenMode === 'availability') {
    return (
      <Screen
        {...formScreenProps}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        header={
          <ScreenHeader
            title="Disponibilidad"
            eyebrow={`${editingVehicle.brand} ${editingVehicle.model}`}
            subtitle="Abre las fechas en las que los conductores pueden reservar."
            onBack={() => void handleBack()}
            backLabel="Volver al vehículo"
          />
        }
      >
        <Card>
          <CardHeader
            title={editingAvailabilityWindowId ? 'Editar disponibilidad' : 'Nueva disponibilidad'}
            icon="calendar-outline"
          />
          <CalendarPicker
            key={calendarKey}
            availabilityWindows={availabilityWindows}
            bookings={[]}
            initialDateRange={initialAvailabilitySelection}
            mode="owner"
            onDateRangeChange={(startDate, startHour, endDate, endHour) => {
              setAvailabilityError(null);
              setAvailabilityRange(
                startDate && endDate
                  ? { start: calendarDayHourToIso(startDate, startHour), end: calendarDayHourToIso(endDate, endHour) }
                  : null
              );
            }}
          />
          {availabilityError ? <InlineMessage tone="error" message={availabilityError} /> : null}
          <View style={styles.rowActions}>
            {editingAvailabilityWindowId ? (
              <Button label="Cancelar edición" variant="secondary" onPress={resetAvailabilityForm} style={styles.flex1} />
            ) : null}
            <Button
              label={editingAvailabilityWindowId ? 'Guardar cambios' : 'Añadir disponibilidad'}
              icon={editingAvailabilityWindowId ? 'save-outline' : 'add'}
              onPress={() => void handleSaveAvailabilityWindow()}
              loading={availabilityWindowsSaving}
              disabled={!availabilityRange}
              style={styles.flex1}
            />
          </View>
        </Card>

        <SectionTitle title="Próximas fechas" count={futureWindows.length} />

        {availabilityWindowsLoading && availabilityWindows.length === 0 ? (
          <View style={styles.stack}>
            <Skeleton height={64} radius={radiusTokens.card} />
            <Skeleton height={64} radius={radiusTokens.card} />
          </View>
        ) : availabilityWindowsError ? (
          <ErrorState
            message={availabilityWindowsError}
            onRetry={() => void fetchAvailabilityWindowsByVehicleId(editingVehicle.id)}
          />
        ) : futureWindows.length === 0 ? (
          <EmptyState
            compact
            icon="calendar-clear-outline"
            title="Sin fechas abiertas"
            description="Mientras no añadas disponibilidad, nadie podrá reservar este vehículo."
          />
        ) : (
          <View style={styles.stack}>
            {futureWindows.map((window) => (
              <Card
                key={window.id}
                variant="outlined"
                padding={spacingTokens.md}
                style={editingAvailabilityWindowId === window.id ? styles.windowEditing : undefined}
              >
                <View style={styles.windowRow}>
                  <View style={styles.windowIcon}>
                    <Ionicons name="calendar" size={18} color={colorTokens.primary} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.windowText}>{formatDateTimeMadrid(window.startDatetime)}</Text>
                    <Text style={styles.caption}>hasta {formatDateTimeMadrid(window.endDatetime)}</Text>
                  </View>
                </View>
                <View style={styles.windowActions}>
                  <Button
                    label="Editar"
                    size="sm"
                    icon="create-outline"
                    variant="secondary"
                    onPress={() => handleEditAvailabilityWindow(window.id)}
                    disabled={availabilityWindowsSaving}
                  />
                  <Button
                    label="Eliminar"
                    size="sm"
                    icon="trash-outline"
                    variant="dangerGhost"
                    onPress={() => void handleDeleteAvailabilityWindow(window.id)}
                    disabled={availabilityWindowsSaving}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Crear / editar                                                           */
  /* ------------------------------------------------------------------------ */

  if (screenMode === 'create' || (screenMode === 'edit' && editingVehicle)) {
    const isEdit = screenMode === 'edit' && !!editingVehicle;
    const primaryImageUrl = editingVehicle ? resolveStoredImageUrl(imageByVehicleId[editingVehicle.id] ?? null) : null;

    const formFields = (
      <Card>
        <CardHeader title="Datos del anuncio" icon="car-sport-outline" />
        <View style={styles.formRow}>
          <TextField
            label="Marca"
            required
            value={form.brand}
            onChangeText={(value) => updateForm('brand', value)}
            placeholder="Ej. Seat"
            autoCapitalize="words"
            error={formErrors.brand}
            containerStyle={styles.flex1}
          />
          <TextField
            label="Modelo"
            required
            value={form.model}
            onChangeText={(value) => updateForm('model', value)}
            placeholder="Ej. Ibiza"
            autoCapitalize="words"
            error={formErrors.model}
            containerStyle={styles.flex1}
          />
        </View>
        <View style={styles.formRow}>
          <TextField
            label="Año"
            required
            value={form.year}
            onChangeText={(value) => updateForm('year', value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder={String(CURRENT_YEAR)}
            keyboardType="number-pad"
            error={formErrors.year}
            containerStyle={styles.flex1}
          />
          <TextField
            label="Precio por día"
            required
            value={form.pricePerDay}
            onChangeText={(value) => updateForm('pricePerDay', value.replace(/[^0-9.,]/g, ''))}
            placeholder="45"
            keyboardType="decimal-pad"
            right={<Text style={styles.unit}>€</Text>}
            error={formErrors.pricePerDay}
            containerStyle={styles.flex1}
          />
        </View>
        <TextField
          label="Matrícula"
          required={!isEdit}
          value={form.licensePlate}
          onChangeText={(value) => updateForm('licensePlate', value.toUpperCase())}
          placeholder="1234 ABC"
          autoCapitalize="characters"
          autoCorrect={false}
          error={formErrors.licensePlate}
          readOnlyValue={isEdit}
          hint={isEdit ? 'La matrícula no se puede cambiar.' : 'No se muestra públicamente en el anuncio.'}
        />
        <TextField
          label="Descripción"
          required
          value={form.description}
          onChangeText={(value) => updateForm('description', value)}
          placeholder="Estado, equipamiento, normas (mascotas, fumar…)"
          multiline
          maxLength={2000}
          error={formErrors.description}
          hint={formErrors.description ? undefined : `${form.description.length}/2000`}
        />
        <View style={isCompact ? styles.stack : styles.formRow}>
          <SelectField
            label="Combustible"
            value={form.fuelType}
            options={FUEL_TYPE_OPTIONS}
            onChange={(value) => updateForm('fuelType', value)}
            containerStyle={styles.flex1}
          />
          <SelectField
            label="Cambio"
            value={form.transmission}
            options={TRANSMISSION_OPTIONS}
            onChange={(value) => updateForm('transmission', value)}
            containerStyle={styles.flex1}
          />
          <SelectField
            label="Plazas"
            value={form.seats}
            options={SEATS_OPTIONS}
            onChange={(value) => updateForm('seats', value)}
            containerStyle={styles.flex1}
          />
        </View>
        <AddressSearch
          label="Dirección de recogida"
          required
          value={form.address}
          selected={!!form.location}
          error={formErrors.address}
          placeholder="Calle, número y ciudad"
          onChange={(value) => {
            setForm((current) => ({ ...current, address: value, location: null }));
            setFormErrors((current) => ({ ...current, address: undefined }));
          }}
          onSelect={(label, lat, lng) => {
            setForm((current) => ({ ...current, address: label, location: { lat, lng } }));
            setFormErrors((current) => ({ ...current, address: undefined }));
          }}
          onClear={() => setForm((current) => ({ ...current, address: '', location: null }))}
        />

        {formError ? <InlineMessage tone="error" message={formError} /> : null}

        <Button
          label={isEdit ? 'Guardar cambios' : 'Publicar vehículo'}
          icon={isEdit ? 'save-outline' : 'cloud-upload-outline'}
          onPress={() => void (isEdit ? handleUpdateVehicle() : handleCreateVehicle())}
          loading={vehiclesSaving && !statusSaving}
          disabled={isEdit && !isFormDirty}
          fullWidth
        />
      </Card>
    );

    if (!isEdit || !editingVehicle) {
      return (
        <Screen
          {...formScreenProps}
          header={
            <ScreenHeader
              title="Nuevo vehículo"
              subtitle="Publica tu coche en pocos minutos. Después podrás añadir fotos y fechas."
              onBack={() => void handleBack()}
              backLabel="Mis vehículos"
            />
          }
        >
          {formFields}
        </Screen>
      );
    }

    const isActive = editingVehicle.status === 'active';

    return (
      <Screen
        {...formScreenProps}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        header={
          <ScreenHeader
            title={`${editingVehicle.brand} ${editingVehicle.model}`}
            eyebrow="Editar vehículo"
            onBack={() => void handleBack()}
            backLabel="Mis vehículos"
          />
        }
      >
        <Card>
          <View style={styles.summaryRow}>
            <AppImage uri={primaryImageUrl} style={styles.summaryImage} fallbackLabel="Sin portada" />
            <View style={styles.summaryInfo}>
              <StatusChip label={isActive ? 'Publicado' : 'Oculto'} tone={isActive ? 'success' : 'neutral'} dot compact />
              <Text style={styles.summaryPrice}>{formatPriceCompact(editingVehicle.pricePerDay)} / día</Text>
              <Text style={styles.caption} numberOfLines={2}>
                {editingVehicle.locationAddress}
              </Text>
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex1}>
              <Text style={styles.switchTitle}>Visible en Explorar</Text>
              <Text style={styles.caption}>Desactívalo para pausar el anuncio sin borrarlo.</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={(value) => void handleToggleStatus(value)}
              disabled={statusSaving || vehiclesSaving}
              trackColor={{ false: colorTokens.borderStrong, true: colorTokens.success }}
              thumbColor={Platform.OS === 'android' ? colorTokens.white : undefined}
              accessibilityLabel="Visible en Explorar"
            />
          </View>
        </Card>

        <View style={isCompact ? styles.stack : styles.formRow}>
          <ManageTile
            icon="images-outline"
            title="Fotos"
            subtitle={
              vehicleImagesLoading && vehicleImages.length === 0
                ? 'Cargando…'
                : vehicleImages.length === 0
                  ? 'Añade la primera foto'
                  : pluralize(vehicleImages.length, 'foto', 'fotos')
            }
            warning={!vehicleImagesLoading && vehicleImages.length === 0}
            onPress={() => setScreenMode('images')}
          />
          <ManageTile
            icon="calendar-outline"
            title="Disponibilidad"
            subtitle={
              availabilityWindowsLoading && availabilityWindows.length === 0
                ? 'Cargando…'
                : futureWindows.length === 0
                  ? 'Sin fechas abiertas'
                  : pluralize(futureWindows.length, 'periodo abierto', 'periodos abiertos')
            }
            warning={!availabilityWindowsLoading && futureWindows.length === 0}
            onPress={handleOpenAvailabilityScreen}
          />
        </View>

        {formFields}

        <Card variant="outlined">
          <CardHeader title="Zona de peligro" icon="warning-outline" subtitle="Eliminar el anuncio no se puede deshacer." />
          <Button
            label="Eliminar vehículo"
            icon="trash-outline"
            variant="dangerGhost"
            onPress={() => void handleDeleteVehicle()}
            disabled={vehiclesSaving}
            style={styles.alignStart}
          />
        </Card>
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Listado                                                                  */
  /* ------------------------------------------------------------------------ */

  const showSkeletons = vehiclesLoading && !vehiclesLoaded;
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
    setScreenMode('create');
  };

  return (
    <Screen
      topPadding={topPadding}
      bottomPadding={bottomPadding + (isCompact ? 72 : 0)}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      header={
        <ScreenHeader
          title="Mis vehículos"
          subtitle="Gestiona tus anuncios, fotos y fechas disponibles."
          right={!isCompact && myVehicles.length > 0 ? <Button label="Nuevo vehículo" icon="add" onPress={openCreate} /> : null}
        />
      }
      overlay={
        isCompact && myVehicles.length > 0 ? (
          <Pressable
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="Publicar nuevo vehículo"
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [
              styles.fab,
              { bottom: bottomPadding + spacingTokens.md },
              pressed && Platform.OS !== 'android' ? styles.fabPressed : null
            ]}
          >
            <Ionicons name="add" size={22} color={colorTokens.white} />
            <Text style={styles.fabLabel}>Nuevo vehículo</Text>
          </Pressable>
        ) : null
      }
    >
      {vehiclesError && myVehicles.length > 0 ? (
        <InlineMessage tone="error" message={vehiclesError} actionLabel="Reintentar" onAction={() => void fetchMyVehicles()} />
      ) : null}

      <View style={[styles.grid, { gap: spacingTokens.lg }]}>
        {showSkeletons
          ? Array.from({ length: columns }).map((_, index) => (
              <VehicleCardSkeleton key={index} style={{ width: cardWidth }} />
            ))
          : myVehicles.map((vehicle) => {
              const primaryImageUrl = resolveStoredImageUrl(imageByVehicleId[vehicle.id] ?? null);
              const isActive = vehicle.status === 'active';
              const details = [
                String(vehicle.year),
                translateFuelType(vehicle.fuelType),
                translateTransmission(vehicle.transmission)
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <Card
                  key={vehicle.id}
                  padding={0}
                  onPress={() => handleOpenVehicleEditor(vehicle.id)}
                  accessibilityLabel={`${vehicle.brand} ${vehicle.model}, ${isActive ? 'publicado' : 'oculto'}`}
                  accessibilityHint="Abre la edición del vehículo"
                  style={[styles.vehicleCard, { width: cardWidth }]}
                >
                  <View>
                    <AppImage
                      uri={primaryImageUrl}
                      style={styles.vehicleImage}
                      fallbackIcon="camera-outline"
                      fallbackLabel="Añade fotos para destacar tu anuncio"
                    />
                    <View style={styles.statusBadge}>
                      <StatusChip label={isActive ? 'Publicado' : 'Oculto'} tone={isActive ? 'success' : 'neutral'} dot compact />
                    </View>
                  </View>
                  <View style={styles.vehicleBody}>
                    <View style={styles.vehicleTitleRow}>
                      <Text style={styles.vehicleTitle} numberOfLines={1}>
                        {vehicle.brand} {vehicle.model}
                      </Text>
                      <Text style={styles.vehiclePrice}>{formatPriceCompact(vehicle.pricePerDay)}/día</Text>
                    </View>
                    <Text style={styles.caption} numberOfLines={1}>
                      {details}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={14} color={colorTokens.textMuted} />
                      <Text style={[styles.caption, styles.flex1]} numberOfLines={1}>
                        {vehicle.locationAddress}
                      </Text>
                    </View>
                    <View style={styles.plate}>
                      <Text style={styles.plateText}>{vehicle.licensePlate}</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
      </View>

      {!vehiclesLoading && vehiclesError && myVehicles.length === 0 ? (
        <ErrorState message={vehiclesError} onRetry={() => void fetchMyVehicles()} />
      ) : null}

      {vehiclesLoaded && !vehiclesLoading && !vehiclesError && myVehicles.length === 0 ? (
        <EmptyState
          icon="car-sport-outline"
          title="Publica tu primer vehículo"
          description="Gana dinero alquilando tu coche cuando no lo uses. Solo necesitas unos datos básicos, fotos y fechas."
          actionLabel="Publicar vehículo"
          onAction={openCreate}
          secondaryActionLabel={onNavigateToTab ? 'Ver cómo lo hacen otros' : undefined}
          onSecondaryAction={onNavigateToTab ? () => onNavigateToTab('explore') : undefined}
        />
      ) : null}
    </Screen>
  );
}

function ManageTile({
  icon,
  title,
  subtitle,
  warning,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  warning?: boolean;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.flex1} padding={spacingTokens.md} accessibilityLabel={`${title}: ${subtitle}`}>
      <View style={styles.manageRow}>
        <View style={[styles.manageIcon, warning ? styles.manageIconWarning : null]}>
          <Ionicons name={icon} size={20} color={warning ? colorTokens.accent2Pressed : colorTokens.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.switchTitle}>{title}</Text>
          <Text style={[styles.caption, warning ? styles.warningText : null]}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colorTokens.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  stack: {
    gap: spacingTokens.md
  },
  alignStart: {
    alignSelf: 'flex-start'
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  warningText: {
    color: colorTokens.accent2Pressed
  },
  unit: {
    color: colorTokens.textMuted,
    ...typographyTokens.bodyStrong
  },
  formRow: {
    flexDirection: 'row',
    gap: spacingTokens.md
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacingTokens.sm
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
  statusBadge: {
    position: 'absolute',
    top: spacingTokens.md,
    left: spacingTokens.md
  },
  vehicleBody: {
    padding: spacingTokens.lg,
    gap: spacingTokens.xs
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  vehicleTitle: {
    flex: 1,
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  vehiclePrice: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  plate: {
    alignSelf: 'flex-start',
    marginTop: spacingTokens.xs,
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colorTokens.secondary,
    backgroundColor: colorTokens.white
  },
  plateText: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong,
    letterSpacing: 1
  },
  fab: {
    position: 'absolute',
    right: spacingTokens.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    minHeight: 52,
    paddingHorizontal: spacingTokens.xl,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.accent2,
    overflow: 'hidden',
    ...shadowTokens.raised
  },
  fabPressed: {
    backgroundColor: colorTokens.accent2Pressed
  },
  fabLabel: {
    color: colorTokens.white,
    ...typographyTokens.captionStrong,
    fontSize: 15
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacingTokens.md,
    alignItems: 'center'
  },
  summaryImage: {
    width: 112,
    height: 80,
    borderRadius: radiusTokens.input
  },
  summaryInfo: {
    flex: 1,
    gap: 4
  },
  summaryPrice: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    paddingTop: spacingTokens.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colorTokens.border
  },
  switchTitle: {
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  manageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colorTokens.infoSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  manageIconWarning: {
    backgroundColor: colorTokens.accentSoft
  },
  photoSkeletons: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  tipRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    alignItems: 'flex-start'
  },
  windowEditing: {
    borderColor: colorTokens.primary,
    borderWidth: 1.5
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  windowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colorTokens.infoSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  windowText: {
    color: colorTokens.textMain,
    ...typographyTokens.bodyStrong,
    fontSize: 14
  },
  windowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacingTokens.sm
  }
});
