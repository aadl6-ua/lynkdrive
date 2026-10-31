import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { httpClient } from '../../api/http';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { UploadTarget, uploadImageToApi } from '../../api/uploads';
import { colorTokens, layoutTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { AppTabKey } from '../../app/types';
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, BookingStatus } from '../../shared/booking';
import { getApiErrorMessage } from '../../shared/errors';
import {
  formatCurrencyEUR,
  formatDateMadrid,
  formatDateRangeMadrid,
  formatMonthYearMadrid,
  getDisplayName,
  pluralize
} from '../../shared/format';
import { canUseCamera, ImagePermissionError, ImageSource, pickImages } from '../../shared/imagePicker';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InlineMessage,
  KeyValueRow,
  ListItemSkeleton,
  OptionList,
  Screen,
  ScreenHeader,
  Sheet,
  Skeleton,
  StarRating,
  StatusChip,
  TextField,
  confirmAction,
  toast
} from '../../shared/ui';
import { useBackHandler } from '../../shared/useBackHandler';
import { PushNotificationsCard } from '../notifications/PushNotificationsCard';
import { OwnerPayoutsCard } from '../payments/OwnerPayoutsCard';
import { hasMinimumProfileData } from '../../shared/verification';
import { LegalSheet } from '../../shared/components/LegalSheet';
import { LEGAL_CONTENT, LegalDoc } from '../../shared/legal';
import { useAuthStore } from '../../store/useAuthStore';
import { UserProfile, useUserProfileStore } from '../../store/useUserProfileStore';

type ProfileMode = 'overview' | 'personal' | 'documents';
type ProfileUploadTarget = Extract<UploadTarget, 'avatar' | 'id_document' | 'driver_license'>;

type BookingItem = {
  id: string;
  vehicleId: string;
  ownerId: string;
  driverId: string;
  startDatetime: string;
  endDatetime: string;
  totalPrice: number;
  createdAt: string;
  status: BookingStatus;
};

type ReviewItem = {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

type VehicleMiniInfo = {
  id: string;
  brand: string;
  model: string;
  year: number;
};

type UserMiniProfile = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

type StatsState = {
  tripsCompleted: number;
  averageRating: number | null;
  vehiclesPublished: number;
};

type ProfileScreenProps = {
  topPadding?: number;
  bottomPadding?: number;
  onNavigateToTab?: (tab: AppTabKey) => void;
};

type UploadState = { target: ProfileUploadTarget; stage: 'processing' | 'uploading'; progress?: number } | null;

const PHONE_PATTERN = /^\+?[0-9\s-]{9,15}$/;

const DOCUMENTS: Array<{ target: 'id_document' | 'driver_license'; field: 'idDocumentUrl' | 'driverLicenseUrl'; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap }> = [
  {
    target: 'id_document',
    field: 'idDocumentUrl',
    title: 'DNI / documento de identidad',
    hint: 'Foto nítida de la cara delantera, sin reflejos.',
    icon: 'card-outline'
  },
  {
    target: 'driver_license',
    field: 'driverLicenseUrl',
    title: 'Permiso de conducir',
    hint: 'Debe estar en vigor y ser legible.',
    icon: 'car-outline'
  }
];

function profilePayload(profile: UserProfile | null) {
  return {
    firstName: profile?.firstName ?? '',
    lastName: profile?.lastName ?? '',
    phoneNumber: profile?.phoneNumber ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    idDocumentUrl: profile?.idDocumentUrl ?? null,
    driverLicenseUrl: profile?.driverLicenseUrl ?? null
  };
}

export function ProfileScreen({ topPadding = 0, bottomPadding = 0, onNavigateToTab }: ProfileScreenProps) {
  const [mode, setMode] = useState<ProfileMode>('overview');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>(null);
  const [sourcePickerFor, setSourcePickerFor] = useState<ProfileUploadTarget | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [overviewStats, setOverviewStats] = useState<StatsState>({ tripsCompleted: 0, averageRating: null, vehiclesPublished: 0 });
  const [driverBookings, setDriverBookings] = useState<BookingItem[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<ReviewItem[]>([]);
  const [vehicleById, setVehicleById] = useState<Record<string, VehicleMiniInfo>>({});
  const [reviewerById, setReviewerById] = useState<Record<string, UserMiniProfile>>({});
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const { profile, loading: profileLoading, saving, error: profileError, fetchMyProfile, updateMyProfile } =
    useUserProfileStore();
  const { userId: authUserId, email: authEmail, loading: authLoading, signOut } = useAuthStore();
  const [accountAction, setAccountAction] = useState<'export' | 'delete' | null>(null);

  const resetPersonalInputs = useCallback(() => {
    setFirstNameInput(profile?.firstName ?? '');
    setLastNameInput(profile?.lastName ?? '');
    setPhoneInput(profile?.phoneNumber ?? '');
    setFieldErrors({});
    setSaveError(null);
  }, [profile?.firstName, profile?.lastName, profile?.phoneNumber]);

  useEffect(() => {
    resetPersonalInputs();
  }, [resetPersonalInputs]);

  const resolvedAvatarUrl = useMemo(() => resolveStoredImageUrl(profile?.avatarUrl ?? null), [profile?.avatarUrl]);
  const hasProfileMinimum = hasMinimumProfileData(profile);
  const displayName = getDisplayName(profile?.firstName, profile?.lastName, 'Completa tu perfil');

  const hasUnsavedPersonalChanges =
    firstNameInput.trim() !== (profile?.firstName ?? '') ||
    lastNameInput.trim() !== (profile?.lastName ?? '') ||
    phoneInput.trim() !== (profile?.phoneNumber ?? '');

  const latestTrips = useMemo(
    () =>
      [...driverBookings]
        .sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime())
        .slice(0, 3),
    [driverBookings]
  );

  const sortedReviews = useMemo(
    () => [...receivedReviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [receivedReviews]
  );
  const visibleReviews = showAllReviews ? sortedReviews : sortedReviews.slice(0, 3);

  const loadOverviewData = useCallback(async () => {
    if (!authUserId) {
      return;
    }

    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const [bookingsResponse, ownerBookingsResponse, reviewsResponse, vehiclesResponse] = await Promise.all([
        httpClient.get<BookingItem[]>('/bookings/mine/as-driver'),
        httpClient.get<BookingItem[]>('/bookings/mine/as-owner'),
        httpClient.get<ReviewItem[]>('/reviews'),
        httpClient.get<VehicleMiniInfo[]>('/vehicles/mine/list')
      ]);

      const allDriverBookings = bookingsResponse.data;
      const userReceivedReviews = reviewsResponse.data.filter((review) => review.revieweeId === authUserId);

      setOverviewStats({
        // Igual que el resumen público: viajes completados como conductor y como propietario.
        tripsCompleted: [...allDriverBookings, ...ownerBookingsResponse.data].filter(
          (booking) => booking.status === 'completed'
        ).length,
        averageRating:
          userReceivedReviews.length > 0
            ? userReceivedReviews.reduce((sum, review) => sum + review.rating, 0) / userReceivedReviews.length
            : null,
        vehiclesPublished: vehiclesResponse.data.length
      });
      setDriverBookings(allDriverBookings);
      setReceivedReviews(userReceivedReviews);
      setOverviewLoaded(true);

      const vehicleIds = Array.from(
        new Set(
          [...allDriverBookings]
            .sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime())
            .slice(0, 3)
            .map((booking) => booking.vehicleId)
        )
      );
      const reviewerIds = Array.from(new Set(userReceivedReviews.map((review) => review.reviewerId)));

      const [vehicleRows, reviewerRows] = await Promise.all([
        Promise.allSettled(vehicleIds.map(async (id) => (await httpClient.get<VehicleMiniInfo>(`/vehicles/${id}`)).data)),
        Promise.allSettled(reviewerIds.map(async (id) => (await httpClient.get<UserMiniProfile>(`/users/${id}`)).data))
      ]);

      setVehicleById(
        Object.fromEntries(
          vehicleRows.flatMap((result) => (result.status === 'fulfilled' ? [[result.value.id, result.value]] : []))
        )
      );
      setReviewerById(
        Object.fromEntries(
          reviewerRows.flatMap((result) => (result.status === 'fulfilled' ? [[result.value.id, result.value]] : []))
        )
      );
    } catch (fetchError: unknown) {
      setOverviewError(getApiErrorMessage(fetchError, 'No se pudo cargar tu actividad.'));
    } finally {
      setOverviewLoading(false);
    }
  }, [authUserId]);

  useEffect(() => {
    void loadOverviewData();
  }, [loadOverviewData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchMyProfile(), loadOverviewData()]);
    setRefreshing(false);
  };

  const leaveEditMode = useCallback(async () => {
    if (mode === 'personal' && hasUnsavedPersonalChanges) {
      const confirmed = await confirmAction({
        title: '¿Salir sin guardar?',
        message: 'Perderás los cambios en tus datos personales.',
        confirmLabel: 'Salir',
        cancelLabel: 'Seguir editando',
        destructive: true
      });

      if (!confirmed) {
        return;
      }

      resetPersonalInputs();
    }

    setMode('overview');
  }, [mode, hasUnsavedPersonalChanges, resetPersonalInputs]);

  useBackHandler(mode !== 'overview', () => void leaveEditMode());

  const handleSavePersonal = async () => {
    const errors: typeof fieldErrors = {};

    if (!firstNameInput.trim()) errors.firstName = 'Indica tu nombre.';
    if (!lastNameInput.trim()) errors.lastName = 'Indica tus apellidos.';
    if (!phoneInput.trim()) {
      errors.phone = 'El teléfono es necesario para reservar.';
    } else if (!PHONE_PATTERN.test(phoneInput.trim())) {
      errors.phone = 'Introduce un teléfono válido (ej. +34 600 123 123).';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaveError(null);
    const ok = await updateMyProfile({
      ...profilePayload(profile),
      firstName: firstNameInput.trim(),
      lastName: lastNameInput.trim(),
      phoneNumber: phoneInput.trim()
    });

    if (!ok) {
      setSaveError(useUserProfileStore.getState().mutationMessage ?? 'No se pudieron guardar los cambios.');
      return;
    }

    toast.success('Datos personales guardados.');
    setMode('overview');
  };

  const startUpload = (target: ProfileUploadTarget) => {
    if (upload) {
      return;
    }

    if (canUseCamera()) {
      setSourcePickerFor(target);
    } else {
      void handleUploadUserImage(target, 'library');
    }
  };

  const handleUploadUserImage = async (target: ProfileUploadTarget, source: ImageSource) => {
    try {
      const [asset] = await pickImages(source);

      if (!asset) {
        return;
      }

      setUpload({ target, stage: 'processing' });
      const prepared = await prepareUploadImage(asset, target);
      setUpload({ target, stage: 'uploading', progress: 0 });

      const uploaded = await uploadImageToApi({
        target,
        ownerId: authUserId ?? undefined,
        fileUri: prepared.fileUri,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        webFile: prepared.webFile,
        onProgress: (fraction) => setUpload({ target, stage: 'uploading', progress: fraction })
      });

      const field = target === 'avatar' ? 'avatarUrl' : target === 'id_document' ? 'idDocumentUrl' : 'driverLicenseUrl';
      const ok = await updateMyProfile({ ...profilePayload(useUserProfileStore.getState().profile), [field]: uploaded.persistedValue });

      if (!ok) {
        throw new Error(useUserProfileStore.getState().mutationMessage ?? 'No se pudo guardar la imagen.');
      }

      toast.success(target === 'avatar' ? 'Foto de perfil actualizada.' : 'Documento subido. Lo revisaremos en breve.');
    } catch (uploadError: unknown) {
      const message =
        uploadError instanceof ImagePermissionError
          ? uploadError.message
          : getApiErrorMessage(
              uploadError,
              uploadError instanceof Error && uploadError.message ? uploadError.message : 'No se pudo subir la imagen.'
            );
      toast.error(message);
    } finally {
      setUpload(null);
    }
  };

  const handleRemoveDocument = async (field: 'idDocumentUrl' | 'driverLicenseUrl', title: string) => {
    const confirmed = await confirmAction({
      title: `¿Eliminar ${title.toLowerCase()}?`,
      message: 'Sin este documento no podrás reservar ni gestionar viajes.',
      confirmLabel: 'Eliminar',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    const ok = await updateMyProfile({ ...profilePayload(profile), [field]: null });

    if (ok) {
      toast.success('Documento eliminado.');
    } else {
      toast.error(useUserProfileStore.getState().mutationMessage ?? 'No se pudo eliminar el documento.');
    }
  };

  const handleExportData = async () => {
    setAccountAction('export');

    try {
      const { data } = await httpClient.get('/users/me/export');
      const json = JSON.stringify(data, null, 2);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lynkdrive-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        // Revocar en el mismo tick puede cancelar la descarga en Safari y Firefox.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('Descarga iniciada.');
      } else {
        await Share.share({ title: 'Mis datos de LynkDrive', message: json });
      }
    } catch (exportError: unknown) {
      toast.error(getApiErrorMessage(exportError, 'No se pudieron exportar tus datos.'));
    } finally {
      setAccountAction(null);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = await confirmAction({
      title: '¿Eliminar tu cuenta?',
      message:
        'Se borrarán tu perfil, tus documentos y tus vehículos publicados. Las reservas finalizadas se conservan sin tus datos personales. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar cuenta',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    setAccountAction('delete');

    try {
      await httpClient.delete('/users/me');
      toast.success('Tu cuenta se ha eliminado.');
      await signOut();
      // No dejamos el email de una cuenta borrada en el formulario de acceso.
      useAuthStore.getState().setEmailInput('');
    } catch (deleteError: unknown) {
      toast.error(
        getApiErrorMessage(
          deleteError,
          'No se pudo eliminar la cuenta. Si tienes reservas activas, finalízalas o cancélalas primero.'
        )
      );
    } finally {
      setAccountAction(null);
    }
  };

  const handleSignOut = async () => {
    const confirmed = await confirmAction({
      title: '¿Cerrar sesión?',
      message: 'Tendrás que volver a introducir tu email y contraseña.',
      confirmLabel: 'Cerrar sesión',
      destructive: true
    });

    if (confirmed) {
      await signOut();
    }
  };

  const uploadLabel = (target: ProfileUploadTarget) =>
    upload?.target === target
      ? upload.stage === 'processing'
        ? 'Optimizando…'
        : `Subiendo ${Math.round((upload.progress ?? 0) * 100)}%`
      : null;

  const avatarEditor = (size: number) => (
    <Pressable
      onPress={() => startUpload('avatar')}
      disabled={!!upload}
      accessibilityRole="button"
      accessibilityLabel="Cambiar foto de perfil"
      style={({ pressed }) => [styles.avatarWrap, pressed ? styles.pressed : null]}
    >
      <Avatar uri={resolvedAvatarUrl} name={displayName} size={size} />
      {upload?.target === 'avatar' ? (
        <View style={[styles.avatarOverlay, { borderRadius: size / 2 }]}>
          <ActivityIndicator color={colorTokens.white} />
        </View>
      ) : null}
      <View style={styles.avatarBadge}>
        <Ionicons name="camera" size={14} color={colorTokens.white} />
      </View>
    </Pressable>
  );

  const sheets = (
    <>
      <Sheet visible={!!sourcePickerFor} onClose={() => setSourcePickerFor(null)} title="Añadir imagen">
        <OptionList
          options={[
            { value: 'camera', label: 'Hacer foto', icon: 'camera-outline' },
            { value: 'library', label: 'Elegir de la galería', icon: 'images-outline' }
          ]}
          onSelect={(value) => {
            const target = sourcePickerFor;
            setSourcePickerFor(null);
            if (target) {
              // Esperamos al cierre de la hoja para no solapar modales en iOS.
              setTimeout(() => void handleUploadUserImage(target, value as ImageSource), 350);
            }
          }}
        />
      </Sheet>
      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );

  const screenProps = { topPadding, bottomPadding, maxWidth: layoutTokens.formMaxWidth };

  /* ------------------------------------------------------------------------ */
  /* Datos personales                                                         */
  /* ------------------------------------------------------------------------ */

  if (mode === 'personal') {
    return (
      <Screen
        {...screenProps}
        header={
          <ScreenHeader
            title="Datos personales"
            subtitle="Así te verán propietarios y conductores."
            onBack={() => void leaveEditMode()}
            backLabel="Perfil"
          />
        }
      >
        <Card>
          <View style={styles.avatarRow}>
            {avatarEditor(72)}
            <View style={styles.flex1}>
              <Text style={styles.strong}>Foto de perfil</Text>
              <Text style={styles.caption}>{uploadLabel('avatar') ?? 'Una foto real genera más confianza.'}</Text>
            </View>
          </View>
        </Card>
        <Card>
          <TextField
            label="Nombre"
            required
            value={firstNameInput}
            onChangeText={(value) => {
              setFirstNameInput(value);
              setFieldErrors((current) => ({ ...current, firstName: undefined }));
            }}
            placeholder="Tu nombre"
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            error={fieldErrors.firstName}
          />
          <TextField
            label="Apellidos"
            required
            value={lastNameInput}
            onChangeText={(value) => {
              setLastNameInput(value);
              setFieldErrors((current) => ({ ...current, lastName: undefined }));
            }}
            placeholder="Tus apellidos"
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            error={fieldErrors.lastName}
          />
          <TextField
            label="Teléfono"
            required
            value={phoneInput}
            onChangeText={(value) => {
              setPhoneInput(value);
              setFieldErrors((current) => ({ ...current, phone: undefined }));
            }}
            placeholder="+34 600 123 123"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            leftIcon="call-outline"
            error={fieldErrors.phone}
          />
          <TextField label="Email" value={authEmail ?? ''} readOnlyValue leftIcon="mail-outline" hint="El email de acceso no se puede cambiar." />
          {saveError ? <InlineMessage tone="error" message={saveError} /> : null}
          <Button
            label="Guardar cambios"
            icon="save-outline"
            onPress={() => void handleSavePersonal()}
            loading={saving}
            disabled={!hasUnsavedPersonalChanges}
            fullWidth
          />
        </Card>
        {sheets}
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Documentación                                                            */
  /* ------------------------------------------------------------------------ */

  if (mode === 'documents') {
    return (
      <Screen
        {...screenProps}
        header={
          <ScreenHeader
            title="Documentación"
            subtitle="La necesitamos para verificar tu identidad antes de reservar."
            onBack={() => void leaveEditMode()}
            backLabel="Perfil"
          />
        }
      >
        <InlineMessage
          tone={profile?.isVerified ? 'success' : 'info'}
          title={profile?.isVerified ? 'Cuenta verificada' : 'Verificación pendiente'}
          message={
            profile?.isVerified
              ? 'Tu documentación está verificada. Ya puedes reservar y publicar.'
              : 'Sube ambos documentos. El equipo los revisa y activa tu cuenta. Se guardan de forma privada.'
          }
        />
        {DOCUMENTS.map((doc) => {
          const uploaded = !!profile?.[doc.field];
          const busyLabel = uploadLabel(doc.target);

          return (
            <Card key={doc.target}>
              <CardHeader
                title={doc.title}
                icon={doc.icon}
                subtitle={doc.hint}
                right={
                  <StatusChip
                    compact
                    label={uploaded ? (profile?.isVerified ? 'Verificado' : 'En revisión') : 'Pendiente'}
                    tone={uploaded ? (profile?.isVerified ? 'success' : 'warning') : 'neutral'}
                  />
                }
              />
              {busyLabel ? (
                <View style={styles.progressRow}>
                  <ActivityIndicator color={colorTokens.primary} size="small" />
                  <Text style={styles.caption}>{busyLabel}</Text>
                  {upload?.stage === 'uploading' ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round((upload.progress ?? 0) * 100)}%` }]} />
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.rowActions}>
                <Button
                  label={uploaded ? 'Reemplazar' : 'Subir documento'}
                  icon={uploaded ? 'refresh' : 'cloud-upload-outline'}
                  variant={uploaded ? 'secondary' : 'primary'}
                  onPress={() => startUpload(doc.target)}
                  disabled={!!upload || saving}
                  style={styles.flex1}
                />
                {uploaded ? (
                  <Button
                    label="Eliminar"
                    variant="dangerGhost"
                    onPress={() => void handleRemoveDocument(doc.field, doc.title)}
                    disabled={!!upload || saving}
                  />
                ) : null}
              </View>
            </Card>
          );
        })}
        {sheets}
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Resumen                                                                  */
  /* ------------------------------------------------------------------------ */

  const verificationSteps = [
    { label: 'Nombre, apellidos y teléfono', done: hasProfileMinimum, onPress: () => setMode('personal') },
    { label: 'DNI subido', done: !!profile?.idDocumentUrl, onPress: () => setMode('documents') },
    { label: 'Permiso de conducir subido', done: !!profile?.driverLicenseUrl, onPress: () => setMode('documents') },
    { label: 'Revisión de LynkDrive', done: !!profile?.isVerified, onPress: undefined }
  ];
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen
      {...screenProps}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      header={<ScreenHeader title="Perfil" />}
    >
      <Card>
        <View style={styles.hero}>
          {avatarEditor(80)}
          <View style={styles.heroText}>
            {profileLoading && !profile ? (
              <>
                <Skeleton width="70%" height={22} />
                <Skeleton width="50%" height={14} />
              </>
            ) : (
              <>
                <Text style={styles.heroName} numberOfLines={2}>
                  {displayName}
                </Text>
                <Text style={styles.caption} numberOfLines={1}>
                  {authEmail ?? ''}
                </Text>
                <View style={styles.chipRow}>
                  <StatusChip
                    compact
                    icon={profile?.isVerified ? 'shield-checkmark' : 'shield-outline'}
                    label={profile?.isVerified ? 'Verificado' : 'Sin verificar'}
                    tone={profile?.isVerified ? 'success' : 'warning'}
                  />
                  {profile?.createdAt ? (
                    <StatusChip compact label={`Desde ${formatMonthYearMadrid(profile.createdAt).toLowerCase()}`} />
                  ) : null}
                </View>
              </>
            )}
          </View>
        </View>
        {uploadLabel('avatar') ? <Text style={styles.caption}>{uploadLabel('avatar')}</Text> : null}
        <Button label="Editar datos personales" icon="create-outline" variant="secondary" onPress={() => setMode('personal')} fullWidth />
      </Card>

      {profileError && !profile ? (
        <InlineMessage tone="error" message={profileError} actionLabel="Reintentar" onAction={() => void fetchMyProfile()} />
      ) : null}

      {profile && !profile.isVerified ? (
        <Card>
          <CardHeader
            title="Verifica tu cuenta"
            icon="shield-checkmark-outline"
            subtitle="Necesario para reservar, pagar y gestionar viajes."
          />
          {verificationSteps.map((step) => (
            <Pressable
              key={step.label}
              onPress={step.onPress}
              disabled={!step.onPress || step.done}
              accessibilityRole={step.onPress && !step.done ? 'button' : 'text'}
              accessibilityState={{ checked: step.done }}
              style={({ pressed }) => [styles.stepRow, pressed ? styles.pressed : null]}
            >
              <Ionicons
                name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={step.done ? colorTokens.success : colorTokens.borderStrong}
              />
              <Text style={[styles.stepText, step.done ? styles.stepTextDone : null]}>{step.label}</Text>
              {step.onPress && !step.done ? <Ionicons name="chevron-forward" size={18} color={colorTokens.textMuted} /> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}

      <View style={styles.stats}>
        <StatTile label="Viajes" value={String(overviewStats.tripsCompleted)} loading={overviewLoading && !overviewLoaded} />
        <StatTile
          label="Valoración"
          value={overviewStats.averageRating === null ? '—' : overviewStats.averageRating.toFixed(1)}
          loading={overviewLoading && !overviewLoaded}
          icon={overviewStats.averageRating === null ? undefined : 'star'}
        />
        <StatTile label="Vehículos" value={String(overviewStats.vehiclesPublished)} loading={overviewLoading && !overviewLoaded} />
      </View>

      {overviewError ? (
        <InlineMessage tone="error" message={overviewError} actionLabel="Reintentar" onAction={() => void loadOverviewData()} />
      ) : null}

      <Card>
        <CardHeader
          title="Documentación"
          icon="document-lock-outline"
          right={<Button label="Gestionar" size="sm" variant="ghost" onPress={() => setMode('documents')} />}
        />
        {DOCUMENTS.map((doc) => {
          const uploaded = !!profile?.[doc.field];
          return (
            <View key={doc.target} style={styles.docRow}>
              <Ionicons name={doc.icon} size={20} color={colorTokens.secondary} />
              <Text style={[styles.strong, styles.flex1]}>{doc.title}</Text>
              <StatusChip
                compact
                label={uploaded ? (profile?.isVerified ? 'Verificado' : 'En revisión') : 'Pendiente'}
                tone={uploaded ? (profile?.isVerified ? 'success' : 'warning') : 'neutral'}
              />
            </View>
          );
        })}
      </Card>

      <Card>
        <CardHeader title="Datos personales" icon="person-outline" />
        <View>
          <KeyValueRow label="Nombre" value={getDisplayName(profile?.firstName, profile?.lastName, '—')} />
          <KeyValueRow label="Teléfono" value={profile?.phoneNumber || 'Sin teléfono'} />
          <KeyValueRow label="Email" value={authEmail ?? '—'} last />
        </View>
      </Card>

      <Card>
        <CardHeader
          title="Últimos viajes"
          icon="map-outline"
          subtitle="Como conductor"
          right={
            onNavigateToTab && driverBookings.length > 0 ? (
              <Button label="Ver todos" size="sm" variant="ghost" onPress={() => onNavigateToTab('trips')} />
            ) : undefined
          }
        />
        {overviewLoading && !overviewLoaded ? (
          <ListItemSkeleton lines={2} />
        ) : latestTrips.length === 0 ? (
          <EmptyState
            compact
            icon="car-outline"
            title="Sin viajes todavía"
            description="Cuando reserves un coche aparecerá aquí."
            actionLabel={onNavigateToTab ? 'Explorar vehículos' : undefined}
            onAction={onNavigateToTab ? () => onNavigateToTab('explore') : undefined}
          />
        ) : (
          latestTrips.map((booking) => {
            const vehicle = vehicleById[booking.vehicleId];
            return (
              <View key={booking.id} style={styles.tripRow}>
                <View style={styles.flex1}>
                  <Text style={styles.strong} numberOfLines={1}>
                    {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo'}
                  </Text>
                  <Text style={styles.caption}>{formatDateRangeMadrid(booking.startDatetime, booking.endDatetime)}</Text>
                </View>
                <View style={styles.tripRight}>
                  <StatusChip compact label={BOOKING_STATUS_LABEL[booking.status]} tone={BOOKING_STATUS_TONE[booking.status]} />
                  <Text style={styles.strong}>{formatCurrencyEUR(booking.totalPrice)}</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <CardHeader
          title="Valoraciones recibidas"
          icon="star-outline"
          subtitle={receivedReviews.length > 0 ? pluralize(receivedReviews.length, 'valoración', 'valoraciones') : undefined}
        />
        {overviewLoading && !overviewLoaded ? (
          <ListItemSkeleton lines={2} />
        ) : visibleReviews.length === 0 ? (
          <Text style={styles.caption}>Aún no tienes valoraciones. Aparecerán aquí tras completar viajes.</Text>
        ) : (
          <>
            {visibleReviews.map((review) => {
              const reviewer = reviewerById[review.reviewerId];
              const reviewerName = getDisplayName(reviewer?.firstName, reviewer?.lastName);
              return (
                <View key={review.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Avatar uri={resolveStoredImageUrl(reviewer?.avatarUrl ?? null)} name={reviewerName} size={36} />
                    <View style={styles.flex1}>
                      <Text style={styles.strong}>{reviewerName}</Text>
                      <Text style={styles.caption}>{formatDateMadrid(review.createdAt)}</Text>
                    </View>
                    <StarRating value={review.rating} size={14} />
                  </View>
                  {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                </View>
              );
            })}
            {sortedReviews.length > 3 ? (
              <Button
                label={showAllReviews ? 'Ver menos' : `Ver todas (${sortedReviews.length})`}
                size="sm"
                variant="ghost"
                onPress={() => setShowAllReviews((current) => !current)}
                style={styles.alignStart}
              />
            ) : null}
          </>
        )}
      </Card>

      <OwnerPayoutsCard />

      <PushNotificationsCard />

      <Card padding={spacingTokens.sm}>
        {(
          [
            { key: 'terms', icon: 'document-text-outline' },
            { key: 'privacy', icon: 'lock-closed-outline' },
            { key: 'cancellation', icon: 'return-up-back-outline' }
          ] as Array<{ key: LegalDoc; icon: keyof typeof Ionicons.glyphMap }>
        ).map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setLegalDoc(item.key)}
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(13,27,42,0.06)' }}
            style={({ pressed }) => [styles.menuRow, pressed ? styles.pressed : null]}
          >
            <Ionicons name={item.icon} size={20} color={colorTokens.secondary} />
            <Text style={[styles.strong, styles.flex1]}>{LEGAL_CONTENT[item.key].title}</Text>
            <Ionicons name="chevron-forward" size={18} color={colorTokens.textMuted} />
          </Pressable>
        ))}
      </Card>

      <Card>
        <CardHeader title="Privacidad y cuenta" icon="shield-checkmark-outline" />
        <Text style={styles.caption}>
          Puedes descargar una copia de todos tus datos o eliminar tu cuenta. Para eliminarla no debes tener reservas en curso.
        </Text>
        <View style={styles.accountActions}>
          <Button
            label="Descargar mis datos"
            icon="download-outline"
            variant="secondary"
            size="sm"
            onPress={() => void handleExportData()}
            loading={accountAction === 'export'}
            disabled={accountAction !== null}
          />
          <Button
            label="Eliminar cuenta"
            icon="trash-outline"
            variant="dangerGhost"
            size="sm"
            onPress={() => void handleDeleteAccount()}
            loading={accountAction === 'delete'}
            disabled={accountAction !== null}
          />
        </View>
      </Card>

      <Button
        label="Cerrar sesión"
        icon="log-out-outline"
        variant="dangerGhost"
        onPress={() => void handleSignOut()}
        loading={authLoading}
        fullWidth
      />
      <Text style={styles.version}>LynkDrive · versión {appVersion}</Text>
      {sheets}
    </Screen>
  );
}

function StatTile({
  label,
  value,
  loading,
  icon
}: {
  label: string;
  value: string;
  loading: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value}`}>
      {loading ? (
        <Skeleton width={40} height={24} />
      ) : (
        <View style={styles.statValueRow}>
          {icon ? <Ionicons name={icon} size={18} color={colorTokens.accent1} /> : null}
          <Text style={styles.statValue}>{value}</Text>
        </View>
      )}
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  accountActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm,
    marginTop: spacingTokens.md
  },
  alignStart: {
    alignSelf: 'flex-start'
  },
  pressed: {
    opacity: 0.75
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  strong: {
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.lg
  },
  heroText: {
    flex: 1,
    gap: 4
  },
  heroName: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2
  },
  avatarWrap: {
    position: 'relative'
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,27,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colorTokens.white,
    backgroundColor: colorTokens.accent2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.lg
  },
  stats: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  statTile: {
    flex: 1,
    gap: 4,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.card,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white,
    alignItems: 'center'
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statValue: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    minHeight: 44
  },
  stepText: {
    flex: 1,
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  stepTextDone: {
    color: colorTokens.textMuted,
    textDecorationLine: 'line-through'
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    minHeight: 40
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colorTokens.border
  },
  tripRight: {
    alignItems: 'flex-end',
    gap: 4
  },
  review: {
    gap: spacingTokens.sm,
    paddingVertical: spacingTokens.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colorTokens.border
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  reviewComment: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    minHeight: 52,
    paddingHorizontal: spacingTokens.md,
    borderRadius: radiusTokens.input
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colorTokens.surfaceMuted,
    overflow: 'hidden'
  },
  progressFill: {
    height: 4,
    backgroundColor: colorTokens.accent2
  },
  version: {
    textAlign: 'center',
    color: colorTokens.textSubtle,
    ...typographyTokens.caption
  }
});
