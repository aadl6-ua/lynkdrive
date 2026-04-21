import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { httpClient } from '../../api/http';
import { UploadTarget, uploadImageToApi } from '../../api/uploads';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
import { StatusChip, StatusChipTone } from '../../app/components/ui/StatusChip';
import { styles } from '../../app/styles';
import { AppTabKey } from '../../app/types';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { hasMinimumProfileData } from '../../shared/verification';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';

type ProfileMode = 'overview' | 'personal' | 'documents';

type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';

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

type VehicleItem = VehicleMiniInfo;

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
  onNavigateToTab?: (tab: AppTabKey) => void;
};

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  paid_confirmed: 'Pago confirmado',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada'
};

function getBookingStatusTone(status: BookingStatus): StatusChipTone {
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

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
  const message = response?.data?.message;

  if (Array.isArray(message)) {
    return message.join('. ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return fallback;
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

function formatMonthYearMadrid(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
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

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.[0] ?? '';
  const last = lastName?.[0] ?? '';
  const initials = `${first}${last}`.toUpperCase();

  return initials || 'U';
}

function getDisplayName(firstName?: string | null, lastName?: string | null): string {
  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return fullName || 'Usuario';
}

type ActionButtonVariant = 'primary' | 'ghost' | 'danger' | 'accent';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
};

function ActionButton({ label, onPress, disabled = false, variant = 'primary' }: ActionButtonProps) {
  const buttonVariantStyle =
    variant === 'ghost'
      ? localStyles.actionButtonGhost
      : variant === 'danger'
        ? localStyles.actionButtonDanger
        : variant === 'accent'
          ? localStyles.actionButtonAccent
        : localStyles.actionButtonPrimary;

  const textVariantStyle =
    variant === 'ghost'
      ? localStyles.actionButtonGhostText
      : variant === 'danger'
        ? localStyles.actionButtonDangerText
        : variant === 'accent'
          ? localStyles.actionButtonAccentText
        : localStyles.actionButtonPrimaryText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[localStyles.actionButton, buttonVariantStyle, disabled ? localStyles.actionButtonDisabled : undefined]}
    >
      <Text style={[localStyles.actionButtonText, textVariantStyle]}>{label}</Text>
    </Pressable>
  );
}

type LabeledInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'sentences'
}: LabeledInputProps) {
  return (
    <View style={localStyles.inputFieldWrap}>
      <Text style={localStyles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={localStyles.inputField}
        placeholder={placeholder}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholderTextColor={colorTokens.textMuted}
      />
    </View>
  );
}

type MenuActionCardProps = {
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
  disabled?: boolean;
};

type ModePillProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function MenuActionCard({ title, subtitle, badge, onPress, disabled = false }: MenuActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[localStyles.menuActionCard, disabled ? localStyles.actionButtonDisabled : undefined]}
    >
      <View style={localStyles.menuActionTextWrap}>
        <Text style={localStyles.menuActionTitle}>{title}</Text>
        <Text style={localStyles.menuActionSubtitle}>{subtitle}</Text>
      </View>
      <View style={localStyles.menuActionSide}>
        {badge ? <Text style={localStyles.menuActionBadge}>{badge}</Text> : null}
        <Text style={localStyles.menuActionChevron}>{'>'}</Text>
      </View>
    </Pressable>
  );
}

function ModePill({ label, active, onPress }: ModePillProps) {
  return (
    <Pressable onPress={onPress} style={[localStyles.modePill, active ? localStyles.modePillActive : undefined]}>
      <Text style={[localStyles.modePillText, active ? localStyles.modePillTextActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

function SectionShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={localStyles.sheetCard}>
      <View style={localStyles.sheetHeader}>
        <Text style={localStyles.sheetTitle}>{title}</Text>
        <Text style={localStyles.sheetSubtitle}>{subtitle}</Text>
      </View>
      <View style={localStyles.sheetContent}>{children}</View>
    </View>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={localStyles.dataRow}>
      <Text style={localStyles.dataLabel}>{label}</Text>
      <Text style={localStyles.dataValue}>{value}</Text>
    </View>
  );
}

function SectionPlaceholder({ height = 96 }: { height?: number }) {
  return <View style={[localStyles.sectionPlaceholder, { height }]} />;
}

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <View style={localStyles.statCard}>
      <Text style={localStyles.statLabel}>{label}</Text>
      {loading ? <SectionPlaceholder height={36} /> : <Text style={localStyles.statValue}>{value}</Text>}
    </View>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <Text style={localStyles.starsText}>{'★'.repeat(rating)}{'☆'.repeat(Math.max(0, 5 - rating))}</Text>
  );
}

export function ProfileScreen({ onNavigateToTab }: ProfileScreenProps) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const [mode, setMode] = useState<ProfileMode>('overview');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [idDocumentInput, setIdDocumentInput] = useState('');
  const [driverLicenseInput, setDriverLicenseInput] = useState('');
  const [profileUploadingField, setProfileUploadingField] = useState<UploadTarget | null>(null);
  const [profileUploadMessage, setProfileUploadMessage] = useState<string | null>(null);
  const [overviewStats, setOverviewStats] = useState<StatsState>({
    tripsCompleted: 0,
    averageRating: null,
    vehiclesPublished: 0
  });
  const [driverBookings, setDriverBookings] = useState<BookingItem[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<ReviewItem[]>([]);
  const [vehicleById, setVehicleById] = useState<Record<string, VehicleMiniInfo>>({});
  const [reviewerById, setReviewerById] = useState<Record<string, UserMiniProfile>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const {
    profile,
    saving,
    error,
    mutationMessage,
    fetchMyProfile,
    updateMyProfile
  } = useUserProfileStore();

  const {
    userId: authUserId,
    email: authEmail,
    loading: authLoading,
    error: authError,
    message: authMessage,
    signOut
  } = useAuthStore();

  useEffect(() => {
    setFirstNameInput(profile?.firstName ?? '');
    setLastNameInput(profile?.lastName ?? '');
    setPhoneInput(profile?.phoneNumber ?? '');
    setAvatarInput(profile?.avatarUrl ?? '');
    setIdDocumentInput(profile?.idDocumentUrl ?? '');
    setDriverLicenseInput(profile?.driverLicenseUrl ?? '');
  }, [profile]);

  const resolvedProfileAvatarUrl = useMemo(
    () => resolveStoredImageUrl(profile?.avatarUrl ?? null),
    [profile?.avatarUrl]
  );

  const hasProfileMinimum = hasMinimumProfileData(profile);
  const isReadyForTransactions = hasProfileMinimum && Boolean(profile?.isVerified);

  const tripReviewByBookingId = useMemo(() => {
    return receivedReviews.reduce<Record<string, ReviewItem>>((acc, review) => {
      if (!acc[review.bookingId]) {
        acc[review.bookingId] = review;
      }
      return acc;
    }, {});
  }, [receivedReviews]);

  const latestTrips = useMemo(() => {
    return [...driverBookings]
      .sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime())
      .slice(0, 3);
  }, [driverBookings]);

  const latestReviews = useMemo(() => {
    return [...receivedReviews]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2);
  }, [receivedReviews]);

  const hasUnsavedPersonalChanges = useMemo(() => {
    return (
      firstNameInput.trim() !== (profile?.firstName ?? '') ||
      lastNameInput.trim() !== (profile?.lastName ?? '') ||
      (phoneInput.trim() || '') !== (profile?.phoneNumber ?? '') ||
      (avatarInput.trim() || '') !== (profile?.avatarUrl ?? '')
    );
  }, [
    avatarInput,
    firstNameInput,
    lastNameInput,
    phoneInput,
    profile?.avatarUrl,
    profile?.firstName,
    profile?.lastName,
    profile?.phoneNumber
  ]);

  const hasUnsavedDocumentChanges = useMemo(() => {
    return (
      (idDocumentInput.trim() || '') !== (profile?.idDocumentUrl ?? '') ||
      (driverLicenseInput.trim() || '') !== (profile?.driverLicenseUrl ?? '')
    );
  }, [driverLicenseInput, idDocumentInput, profile?.driverLicenseUrl, profile?.idDocumentUrl]);

  const hasValidPersonalData = Boolean(firstNameInput.trim() && lastNameInput.trim());

  useEffect(() => {
    if (!authUserId || mode !== 'overview') {
      setOverviewStats({ tripsCompleted: 0, averageRating: null, vehiclesPublished: 0 });
      setDriverBookings([]);
      setReceivedReviews([]);
      setVehicleById({});
      setReviewerById({});
      setOverviewError(null);
      return;
    }

    let cancelled = false;

    const loadOverviewData = async () => {
      setStatsLoading(true);
      setTripsLoading(true);
      setReviewsLoading(true);
      setOverviewError(null);

      try {
        const [bookingsResponse, reviewsResponse, vehiclesResponse] = await Promise.all([
          httpClient.get<BookingItem[]>('/bookings/mine/as-driver'),
          httpClient.get<ReviewItem[]>('/reviews'),
          httpClient.get<VehicleItem[]>('/vehicles/mine/list')
        ]);

        if (cancelled) {
          return;
        }

        const allDriverBookings = bookingsResponse.data;
        const allReviews = reviewsResponse.data;
        const userReceivedReviews = allReviews.filter((review) => review.revieweeId === authUserId);
        const completedTrips = allDriverBookings.filter((booking) => booking.status === 'completed').length;
        const averageRating =
          userReceivedReviews.length > 0
            ? userReceivedReviews.reduce((sum, review) => sum + review.rating, 0) / userReceivedReviews.length
            : null;

        setOverviewStats({
          tripsCompleted: completedTrips,
          averageRating,
          vehiclesPublished: vehiclesResponse.data.length
        });

        setDriverBookings(allDriverBookings);
        setReceivedReviews(userReceivedReviews);

        const latestBookingSlice = [...allDriverBookings]
          .sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime())
          .slice(0, 3);

        const vehicleIds = Array.from(new Set(latestBookingSlice.map((booking) => booking.vehicleId)));
        const reviewerIds = Array.from(new Set(userReceivedReviews.map((review) => review.reviewerId)));

        const [vehicleRows, reviewerRows] = await Promise.all([
          Promise.all(
            vehicleIds.map(async (vehicleId) => {
              const response = await httpClient.get<VehicleMiniInfo>(`/vehicles/${vehicleId}`);
              return response.data;
            })
          ),
          Promise.all(
            reviewerIds.map(async (reviewerId) => {
              const response = await httpClient.get<UserMiniProfile>(`/users/${reviewerId}`);
              return response.data;
            })
          )
        ]);

        if (cancelled) {
          return;
        }

        setVehicleById(
          vehicleRows.reduce<Record<string, VehicleMiniInfo>>((acc, item) => {
            acc[item.id] = item;
            return acc;
          }, {})
        );

        setReviewerById(
          reviewerRows.reduce<Record<string, UserMiniProfile>>((acc, item) => {
            acc[item.id] = item;
            return acc;
          }, {})
        );
      } catch (fetchError: unknown) {
        if (!cancelled) {
          setOverviewError(getApiErrorMessage(fetchError, 'No se pudo cargar el resumen de perfil.'));
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
          setTripsLoading(false);
          setReviewsLoading(false);
        }
      }
    };

    void loadOverviewData();

    return () => {
      cancelled = true;
    };
  }, [authUserId, mode]);

  const completionPercent = useMemo(() => {
    let done = 0;
    const total = 3;

    if (hasProfileMinimum) {
      done += 1;
    }

    if (profile?.idDocumentUrl) {
      done += 1;
    }

    if (profile?.driverLicenseUrl) {
      done += 1;
    }

    return Math.round((done / total) * 100);
  }, [hasProfileMinimum, profile?.idDocumentUrl, profile?.driverLicenseUrl]);

  const buildPayload = () => ({
    firstName: firstNameInput.trim(),
    lastName: lastNameInput.trim(),
    phoneNumber: phoneInput.trim() || null,
    avatarUrl: avatarInput.trim() || null,
    idDocumentUrl: idDocumentInput.trim() || null,
    driverLicenseUrl: driverLicenseInput.trim() || null
  });

  const pickSingleImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      throw new Error('Permiso de galeria denegado');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85
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

      const uploadedUrl = await uploadPickedImage(target, authUserId ?? undefined);

      if (!uploadedUrl) {
        return;
      }

      if (target === 'avatar') {
        setAvatarInput(uploadedUrl);
        await updateMyProfile({ ...buildPayload(), avatarUrl: uploadedUrl });
      }

      if (target === 'id_document') {
        setIdDocumentInput(uploadedUrl);
      }

      if (target === 'driver_license') {
        setDriverLicenseInput(uploadedUrl);
      }

      if (target === 'avatar') {
        setProfileUploadMessage('Avatar actualizado.');
      } else {
        setProfileUploadMessage('Documento subido. Pulsa Guardar cambios para persistir.');
      }
    } catch {
      setProfileUploadMessage('No se pudo subir la imagen. Revisa permisos, tamano y bucket.');
    } finally {
      setProfileUploadingField(null);
    }
  };

  const renderOverview = () => {
    return (
      <>
        <SectionHeader
          title="Perfil"
          subtitle="Tu resumen de cuenta, actividad y validaciones en una sola vista."
          centered={isDesktopWeb}
        />

        <View style={styles.card}>
          <View style={localStyles.inlineActions}>
            <ActionButton label="Editar perfil" onPress={() => setMode('personal')} disabled={!authUserId} variant="accent" />
            <ActionButton
              label="Cerrar sesion"
              onPress={() => void signOut()}
              disabled={authLoading || !authUserId}
              variant="danger"
            />
          </View>
        </View>

        <View style={localStyles.statsRow}>
          <StatCard
            label="Viajes realizados"
            value={String(overviewStats.tripsCompleted)}
            loading={statsLoading}
          />
          <StatCard
            label="Valoracion media"
            value={
              overviewStats.averageRating === null
                ? '—'
                : `${overviewStats.averageRating.toFixed(1)} / 5`
            }
            loading={statsLoading}
          />
          <StatCard
            label="Vehiculos publicados"
            value={String(overviewStats.vehiclesPublished)}
            loading={statsLoading}
          />
        </View>

        <View style={styles.card}>
          <Text style={localStyles.sectionTitle}>Datos personales</Text>
          <DataRow label="Nombre completo" value={getDisplayName(profile?.firstName, profile?.lastName)} />
          {profile?.phoneNumber ? <DataRow label="Telefono" value={profile.phoneNumber} /> : null}
          <DataRow label="Email" value={authEmail ?? 'Sin email en sesion'} />
          <DataRow
            label="Miembro desde"
            value={profile?.createdAt ? formatMonthYearMadrid(profile.createdAt) : 'No disponible'}
          />
        </View>

        <View style={styles.card}>
          <Text style={localStyles.sectionTitle}>Documentacion</Text>
          <View style={localStyles.docsGrid}>
            <View style={localStyles.docCardReadOnly}>
              <View style={localStyles.docHeaderRow}>
                <Text style={localStyles.docIcon}>🪪</Text>
                <View style={localStyles.docHeaderTextWrap}>
                  <Text style={localStyles.docTitle}>DNI / Documento de identidad</Text>
                  <Text style={localStyles.docStatus}>{profile?.idDocumentUrl ? 'Subido' : 'Pendiente'}</Text>
                </View>
              </View>
              {profile?.idDocumentUrl ? (
                <StatusChip
                  label={profile?.isVerified ? 'Verificado' : 'Subido · en revision'}
                  tone={profile?.isVerified ? 'success' : 'warning'}
                />
              ) : (
                <View style={localStyles.inlineActions}>
                  <StatusChip label="Pendiente" tone="neutral" />
                  <ActionButton label="Subir" onPress={() => setMode('documents')} variant="ghost" />
                </View>
              )}
            </View>

            <View style={localStyles.docCardReadOnly}>
              <View style={localStyles.docHeaderRow}>
                <Text style={localStyles.docIcon}>🚘</Text>
                <View style={localStyles.docHeaderTextWrap}>
                  <Text style={localStyles.docTitle}>Permiso de conducir</Text>
                  <Text style={localStyles.docStatus}>{profile?.driverLicenseUrl ? 'Subido' : 'Pendiente'}</Text>
                </View>
              </View>
              {profile?.driverLicenseUrl ? (
                <StatusChip
                  label={profile?.isVerified ? 'Verificado' : 'Subido · en revision'}
                  tone={profile?.isVerified ? 'success' : 'warning'}
                />
              ) : (
                <View style={localStyles.inlineActions}>
                  <StatusChip label="Pendiente" tone="neutral" />
                  <ActionButton label="Subir" onPress={() => setMode('documents')} variant="ghost" />
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          {isDesktopWeb ? (
            <View style={localStyles.sectionWithActionRow}>
              <Text style={localStyles.sectionTitle}>Ultimos viajes como conductor</Text>
              <ActionButton
                label="Ver todos"
                onPress={() => onNavigateToTab?.('trips')}
                variant="ghost"
                disabled={!onNavigateToTab}
              />
            </View>
          ) : (
            <>
              <Text style={localStyles.sectionTitle}>Ultimos viajes como conductor</Text>
              <View style={localStyles.mobileSectionActionWrap}>
                <ActionButton
                  label="Ver todos"
                  onPress={() => onNavigateToTab?.('trips')}
                  variant="ghost"
                  disabled={!onNavigateToTab}
                />
              </View>
            </>
          )}

          {tripsLoading ? (
            <SectionPlaceholder height={140} />
          ) : latestTrips.length === 0 ? (
            <EmptyState
              title="Sin viajes"
              description="Cuando tengas reservas como conductor apareceran aqui."
            />
          ) : (
            <View style={localStyles.tripList}>
              {latestTrips.map((booking) => {
                const vehicle = vehicleById[booking.vehicleId];
                const vehicleLabel = vehicle
                  ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}`
                  : 'Vehiculo';
                const bookingReview = booking.status === 'completed' ? tripReviewByBookingId[booking.id] : undefined;
                const reviewer = bookingReview ? reviewerById[bookingReview.reviewerId] : undefined;

                return (
                  <View key={booking.id} style={localStyles.tripCard}>
                    <View style={localStyles.tripTitleRow}>
                      <Text style={localStyles.tripTitle}>{vehicleLabel}</Text>
                      <StatusChip
                        label={BOOKING_STATUS_LABEL[booking.status]}
                        tone={getBookingStatusTone(booking.status)}
                        compact
                      />
                    </View>

                    <Text style={localStyles.tripMeta}>
                      {formatDateTimeMadrid(booking.startDatetime)} - {formatDateTimeMadrid(booking.endDatetime)}
                    </Text>
                    <Text style={localStyles.tripPrice}>{formatCurrencyEUR(booking.totalPrice)}</Text>

                    {bookingReview && reviewer ? (
                      <View style={localStyles.tripReviewInline}>
                        <Stars rating={bookingReview.rating} />
                        <Text style={localStyles.tripMeta}>Review de {getDisplayName(reviewer.firstName, reviewer.lastName)}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {latestReviews.length > 0 ? (
          <View style={styles.card}>
            <View style={localStyles.sectionWithActionRow}>
              <Text style={localStyles.sectionTitle}>Valoraciones recibidas</Text>
              {receivedReviews.length > 2 ? (
                <ActionButton
                  label="Ver todas"
                  onPress={() => onNavigateToTab?.('trips')}
                  variant="ghost"
                  disabled={!onNavigateToTab}
                />
              ) : null}
            </View>

            {reviewsLoading ? (
              <SectionPlaceholder height={120} />
            ) : (
              <View style={localStyles.reviewList}>
                {latestReviews.map((review) => {
                  const reviewer = reviewerById[review.reviewerId];
                  const reviewerAvatarUrl = resolveStoredImageUrl(reviewer?.avatarUrl ?? null);
                  const reviewerInitials = getInitials(reviewer?.firstName, reviewer?.lastName);

                  return (
                    <View key={review.id} style={localStyles.reviewCard}>
                      <View style={localStyles.reviewHeaderRow}>
                        <View style={localStyles.reviewAuthorRow}>
                          {reviewerAvatarUrl ? (
                            <Image source={{ uri: reviewerAvatarUrl }} style={localStyles.reviewAvatar} resizeMode="cover" />
                          ) : (
                            <View style={localStyles.reviewAvatarFallback}>
                              <Text style={localStyles.reviewAvatarInitials}>{reviewerInitials}</Text>
                            </View>
                          )}
                          <View>
                            <Text style={localStyles.reviewAuthorName}>
                              {getDisplayName(reviewer?.firstName, reviewer?.lastName)}
                            </Text>
                            <Text style={localStyles.reviewDate}>{formatDateTimeMadrid(review.createdAt)}</Text>
                          </View>
                        </View>
                        <Stars rating={review.rating} />
                      </View>
                      {review.comment ? <Text style={localStyles.reviewComment}>{review.comment}</Text> : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={localStyles.sectionTitle}>Legal</Text>
          <View style={localStyles.legalList}>
            <Pressable style={localStyles.legalRow}>
              <Text style={localStyles.legalText}>Terminos y condiciones</Text>
            </Pressable>
            <Pressable style={localStyles.legalRow}>
              <Text style={localStyles.legalText}>Politica de privacidad</Text>
            </Pressable>
            <Pressable style={localStyles.legalRow}>
              <Text style={localStyles.legalText}>Politica de cancelaciones</Text>
            </Pressable>
          </View>
        </View>

        <View style={localStyles.logoutCard}>
          <Text style={localStyles.sectionTitle}>Cerrar sesion</Text>
          <Text style={localStyles.sectionSubtitle}>Cierra tu sesion en este dispositivo de forma segura.</Text>
          <View style={localStyles.inlineActions}>
            <ActionButton
              label="Cerrar sesion"
              onPress={() => void signOut()}
              disabled={authLoading || !authUserId}
              variant="danger"
            />
          </View>
        </View>

        {overviewError ? <Text style={styles.error}>{overviewError}</Text> : null}
      </>
    );
  };

  const renderPersonalMode = () => (
    <SectionShell title="Datos personales" subtitle="Cuida tu primera impresion con una ficha clara y profesional.">
      <View style={localStyles.personalAvatarRow}>
        <Pressable
          onPress={() => void handleUploadUserImage('avatar')}
          disabled={!authUserId || profileUploadingField !== null}
          style={localStyles.personalAvatarPressable}
        >
          {resolvedProfileAvatarUrl ? (
            <Image source={{ uri: resolvedProfileAvatarUrl }} style={localStyles.personalAvatar} resizeMode="cover" />
          ) : (
            <View style={localStyles.personalAvatarFallback}>
              <Text style={localStyles.personalAvatarText}>Foto</Text>
            </View>
          )}
        </Pressable>
        <View style={localStyles.personalAvatarInfo}>
          <Text style={localStyles.personalAvatarTitle}>Imagen de perfil</Text>
          <Text style={localStyles.personalAvatarHint}>Toca la foto para cambiarla al instante.</Text>
        </View>
      </View>

      <View style={localStyles.formGrid}>
        <LabeledInput
          label="Nombre"
          value={firstNameInput}
          onChangeText={setFirstNameInput}
          placeholder="Tu nombre"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Apellidos"
          value={lastNameInput}
          onChangeText={setLastNameInput}
          placeholder="Tus apellidos"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Telefono"
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="+34..."
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
      </View>

      <View style={localStyles.accountStatusCard}>
        <Text style={localStyles.accountStatusLabel}>Email de cuenta</Text>
        <Text style={localStyles.accountStatusValue}>{authEmail ?? 'Sin email en sesion'}</Text>
      </View>

      <View style={localStyles.miniHintCard}>
        <Text style={localStyles.miniHintText}>
          Para uso en produccion: manten nombre y apellidos completos, y revisa telefono antes de guardar.
        </Text>
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton
          label={saving ? 'Guardando...' : 'Guardar cambios'}
          onPress={() => void updateMyProfile(buildPayload())}
          disabled={saving || !authUserId || !hasUnsavedPersonalChanges || !hasValidPersonalData}
        />
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton label="Volver" onPress={() => setMode('overview')} variant="ghost" />
      </View>
    </SectionShell>
  );

  const renderDocumentsMode = () => (
    <SectionShell title="Documentacion" subtitle="Sube tus documentos de forma segura para habilitar transacciones.">
      <View style={localStyles.docsGrid}>
        <View style={localStyles.docCard}>
          <Text style={localStyles.docTitle}>Documento de identidad</Text>
          <Text style={localStyles.docStatus}>{idDocumentInput ? 'Subido' : 'Pendiente'}</Text>
          <View style={localStyles.inlineActions}>
            <ActionButton
              label={profileUploadingField === 'id_document' ? 'Subiendo...' : idDocumentInput ? 'Reemplazar DNI' : 'Subir DNI'}
              onPress={() => void handleUploadUserImage('id_document')}
              disabled={profileUploadingField !== null || !authUserId}
              variant="ghost"
            />
            {idDocumentInput ? (
              <ActionButton label="Eliminar" onPress={() => setIdDocumentInput('')} variant="danger" />
            ) : null}
          </View>
        </View>

        <View style={localStyles.docCard}>
          <Text style={localStyles.docTitle}>Permiso de conducir</Text>
          <Text style={localStyles.docStatus}>{driverLicenseInput ? 'Subido' : 'Pendiente'}</Text>
          <View style={localStyles.inlineActions}>
            <ActionButton
              label={profileUploadingField === 'driver_license' ? 'Subiendo...' : driverLicenseInput ? 'Reemplazar carnet' : 'Subir carnet'}
              onPress={() => void handleUploadUserImage('driver_license')}
              disabled={profileUploadingField !== null || !authUserId}
              variant="ghost"
            />
            {driverLicenseInput ? (
              <ActionButton label="Eliminar" onPress={() => setDriverLicenseInput('')} variant="danger" />
            ) : null}
          </View>
        </View>
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton
          label={saving ? 'Guardando...' : 'Guardar cambios'}
          onPress={() => void updateMyProfile(buildPayload())}
          disabled={saving || !authUserId || !hasUnsavedDocumentChanges}
        />
        <ActionButton label="Volver" onPress={() => setMode('overview')} variant="ghost" />
      </View>
    </SectionShell>
  );

  return (
    <View style={styles.sectionCard}>
      <View style={localStyles.modePillsWrap}>
        <ModePill label="Resumen" active={mode === 'overview'} onPress={() => setMode('overview')} />
        <ModePill label="Personal" active={mode === 'personal'} onPress={() => setMode('personal')} />
        <ModePill label="Docs" active={mode === 'documents'} onPress={() => setMode('documents')} />
      </View>

      <View style={localStyles.statusBanner}>
        <Text style={localStyles.statusBannerTitle}>Estado de tu cuenta</Text>
        <Text style={localStyles.statusBannerText}>
          {isReadyForTransactions
            ? 'Todo listo para reservar, pagar y gestionar viajes.'
            : 'Te faltan datos o verificacion documental para desbloquear todas las funciones.'}
        </Text>
      </View>

      {mode === 'overview' ? renderOverview() : null}
      {mode === 'personal' ? renderPersonalMode() : null}
      {mode === 'documents' ? renderDocumentsMode() : null}

      {authError ? <Text style={styles.error}>{authError}</Text> : null}
      {authMessage ? <Text style={styles.info}>{authMessage}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {mutationMessage ? <Text style={styles.info}>{mutationMessage}</Text> : null}
      {profileUploadMessage ? <Text style={styles.info}>{profileUploadMessage}</Text> : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  modePillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm,
    marginBottom: spacingTokens.md,
    backgroundColor: '#F2F5FA',
    borderRadius: 14,
    padding: spacingTokens.xs
  },
  modePill: {
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs + 1
  },
  modePillActive: {
    borderColor: '#D4DEEA',
    backgroundColor: colorTokens.white,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  modePillText: {
    color: '#4B5563',
    ...typographyTokens.caption
  },
  modePillTextActive: {
    color: '#0F172A',
    fontWeight: '700'
  },
  statusBanner: {
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    gap: spacingTokens.xs,
    marginBottom: spacingTokens.md
  },
  statusBannerTitle: {
    color: '#F8FAFC',
    ...typographyTokens.sectionLabel
  },
  statusBannerText: {
    color: '#CBD5E1',
    ...typographyTokens.caption
  },
  sectionPlaceholder: {
    width: '100%',
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.bgLight,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  heroCard: {
    borderWidth: 1,
    borderColor: colorTokens.primary,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.primary,
    padding: spacingTokens.lg,
    minHeight: 160,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5
    },
    elevation: 4
  },
  heroContent: {
    gap: spacingTokens.lg,
    zIndex: 2
  },
  heroAvatarPressable: {
    position: 'relative'
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  heroAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: 'rgba(244,211,94,0.45)'
  },
  heroAvatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: 'rgba(244,211,94,0.45)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroInitials: {
    color: colorTokens.accent1,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: 0.4
  },
  heroIdentityBlock: {
    flex: 1,
    gap: spacingTokens.xs
  },
  heroName: {
    color: colorTokens.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700'
  },
  heroMail: {
    color: 'rgba(255,255,255,0.5)',
    ...typographyTokens.caption
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.xs,
    marginTop: spacingTokens.xs
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.md,
    gap: spacingTokens.xs
  },
  statLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  statValue: {
    color: colorTokens.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700'
  },
  sectionTitle: {
    color: colorTokens.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700'
  },
  sectionSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.body
  },
  sectionWithActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  mobileSectionActionWrap: {
    marginTop: spacingTokens.sm,
    alignSelf: 'flex-start'
  },
  dataRow: {
    paddingVertical: spacingTokens.xs,
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border,
    gap: 2
  },
  dataLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  dataValue: {
    color: colorTokens.primary,
    ...typographyTokens.body
  },
  qualityList: {
    borderWidth: 0,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colorTokens.white,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    backgroundColor: '#FFFFFF'
  },
  qualityLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.body
  },
  qualityOk: {
    color: colorTokens.accent2,
    ...typographyTokens.caption
  },
  qualityPending: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  menuList: {
    gap: spacingTokens.sm,
    marginTop: spacingTokens.sm
  },
  menuActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5EAF1',
    backgroundColor: colorTokens.white,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  menuActionTextWrap: {
    flex: 1,
    gap: 2,
    paddingRight: spacingTokens.sm
  },
  menuActionTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  menuActionSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  menuActionSide: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacingTokens.xs
  },
  menuActionBadge: {
    color: '#0B6B3A',
    ...typographyTokens.caption
  },
  menuActionChevron: {
    color: '#64748B',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700'
  },
  sheetCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colorTokens.white,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  sheetHeader: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E6ECF3',
    gap: spacingTokens.xs
  },
  sheetTitle: {
    color: colorTokens.primary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700'
  },
  sheetSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  sheetContent: {
    padding: spacingTokens.lg,
    gap: spacingTokens.md
  },
  formGrid: {
    gap: spacingTokens.md
  },
  personalAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    padding: spacingTokens.md
  },
  personalAvatarPressable: {
    position: 'relative'
  },
  personalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#0EA5E9'
  },
  personalAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#0EA5E9',
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  personalAvatarText: {
    color: '#0369A1',
    ...typographyTokens.caption
  },
  personalAvatarInfo: {
    flex: 1,
    gap: spacingTokens.xs
  },
  personalAvatarTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  personalAvatarHint: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  inputFieldWrap: {
    gap: spacingTokens.xs
  },
  inputLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  },
  inputField: {
    borderWidth: 1,
    borderColor: '#D8E1EC',
    borderRadius: 14,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    color: colorTokens.textMain,
    backgroundColor: '#FBFDFF',
    ...typographyTokens.body
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  docsGrid: {
    gap: spacingTokens.md
  },
  docCardReadOnly: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.md,
    gap: spacingTokens.sm
  },
  docHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  docIcon: {
    fontSize: 20,
    lineHeight: 24
  },
  docHeaderTextWrap: {
    flex: 1,
    gap: 2
  },
  docCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    padding: spacingTokens.md,
    gap: spacingTokens.sm
  },
  docTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  docStatus: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  tripList: {
    gap: spacingTokens.sm
  },
  tripCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.md,
    gap: spacingTokens.xs
  },
  tripTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  tripTitle: {
    flex: 1,
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  tripMeta: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  tripPrice: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  tripReviewInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  starsText: {
    color: colorTokens.accent1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  reviewList: {
    gap: spacingTokens.sm
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.md,
    gap: spacingTokens.sm
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  reviewAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    flex: 1
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  reviewAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colorTokens.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.bgLight
  },
  reviewAvatarInitials: {
    color: colorTokens.primary,
    ...typographyTokens.caption
  },
  reviewAuthorName: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  reviewDate: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  reviewComment: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  legalList: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    overflow: 'hidden'
  },
  legalRow: {
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    backgroundColor: colorTokens.white
  },
  legalText: {
    color: colorTokens.primary,
    ...typographyTokens.body
  },
  logoutCard: {
    borderWidth: 1,
    borderColor: colorTokens.alert,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.bgLight,
    padding: spacingTokens.lg,
    gap: spacingTokens.sm
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B0F14',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  actionButtonDisabled: {
    opacity: 0.45
  },
  actionButtonText: {
    ...typographyTokens.caption
  },
  actionButtonPrimary: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A'
  },
  actionButtonPrimaryText: {
    color: colorTokens.white,
    fontWeight: '700'
  },
  actionButtonAccent: {
    backgroundColor: '#f97316',
    borderColor: '#f97316'
  },
  actionButtonAccentText: {
    color: colorTokens.white,
    fontWeight: '700'
  },
  actionButtonGhost: {
    backgroundColor: '#EEF4FF',
    borderColor: '#CBDCF7'
  },
  actionButtonGhostText: {
    color: '#1D4ED8',
    fontWeight: '700'
  },
  actionButtonDanger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3'
  },
  actionButtonDangerText: {
    color: colorTokens.alert,
    fontWeight: '700'
  },
  accountStatusCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    gap: spacingTokens.xs
  },
  accountStatusLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  accountStatusValue: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  miniHintCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm
  },
  miniHintText: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  }
});