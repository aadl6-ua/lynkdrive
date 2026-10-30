import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { httpClient } from '../../api/http';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { uploadImageToApi } from '../../api/uploads';
import { EmptyState } from '../../app/components/ui/EmptyState';
import { SectionHeader } from '../../app/components/ui/SectionHeader';
import { styles } from '../../app/styles';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { AppTabKey } from '../../app/types';
import { UserOverviewModal } from '../../shared/components/UserOverviewModal';
import { PaymentAction } from '../payments/PaymentAction';
import { canUseTransactionalFlows, hasMinimumProfileData } from '../../shared/verification';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';

type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

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
  status: BookingStatus;
};

type BookingChecklistType = 'check_in' | 'check_out';

type BookingChecklistItem = {
  id: string;
  bookingId: string;
  type: BookingChecklistType;
  submittedBy: string;
  mileage: number;
  fuelLevel: number;
  notes: string | null;
  createdAt: string;
};

type ChecklistImageItem = {
  id: string;
  checklistId: string;
  imageUrl: string;
  createdAt: string;
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

type TripsRoleView = 'driver' | 'owner';
type TripsScreenMode = 'list' | 'detail' | 'checklistEditor' | 'reviewComposer';
type ButtonVariant = 'primary' | 'ghost' | 'danger';

type ChecklistDraft = {
  mileage: string;
  fuelLevel: string;
  notes: string;
};

type PendingChecklistImage = {
  previewUri: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  webFile?: File;
};

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

type TripsScreenProps = {
  onNavigateToTab?: (tab: AppTabKey) => void;
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  paid_confirmed: 'Pago confirmado',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada'
};

const STATUS_COLORS: Record<BookingStatus, { background: string; text: string }> = {
  pending: { background: '#fff4cc', text: '#7a5a00' },
  accepted: { background: '#dff2ff', text: '#0e4670' },
  rejected: { background: '#fde2e2', text: '#7a1f1f' },
  paid_confirmed: { background: '#e6f5e8', text: '#1f6a2d' },
  in_progress: { background: '#e4ecff', text: '#1f3f8a' },
  completed: { background: '#e3f7ef', text: '#125238' },
  cancelled: { background: '#f1f3f5', text: '#495057' }
};

function emptyChecklistDraft(): ChecklistDraft {
  return { mileage: '', fuelLevel: '', notes: '' };
}

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

function parseChecklistDraft(draft: ChecklistDraft): { mileage: number; fuelLevel: number; notes: string | null } | null {
  const mileage = Number(draft.mileage);
  const fuelLevel = Number(draft.fuelLevel);

  if (!Number.isFinite(mileage) || mileage < 0) {
    return null;
  }

  if (!Number.isFinite(fuelLevel) || fuelLevel < 0 || fuelLevel > 100) {
    return null;
  }

  const notes = draft.notes.trim() ? draft.notes.trim() : null;

  return {
    mileage,
    fuelLevel,
    notes
  };
}

function canCancelBooking(booking: BookingItem): boolean {
  const cancellableStatuses: BookingStatus[] = ['pending', 'accepted', 'paid_confirmed'];
  return cancellableStatuses.includes(booking.status) && new Date(booking.startDatetime).getTime() > Date.now();
}

function canOpenChecklist(type: BookingChecklistType, status: BookingStatus): boolean {
  if (type === 'check_in') {
    return status === 'paid_confirmed' || status === 'in_progress' || status === 'completed';
  }

  return status === 'in_progress' || status === 'completed';
}

function canCreateChecklistByRole(booking: BookingItem, authUserId: string | null): boolean {
  return booking.driverId === authUserId;
}

function getChecklistBlockReason(type: BookingChecklistType, status: BookingStatus): string {
  if (type === 'check_in') {
    if (status === 'pending' || status === 'accepted') {
      return 'Checklist de entrada bloqueado: la reserva aun no esta en fase de inicio (requiere pago confirmado).';
    }

    if (status === 'rejected' || status === 'cancelled') {
      return 'Checklist de entrada bloqueado: la reserva fue cancelada o rechazada.';
    }
  }

  if (type === 'check_out') {
    if (status === 'pending' || status === 'accepted' || status === 'paid_confirmed') {
      return 'Checklist de salida bloqueado: solo disponible cuando el viaje esta en curso o completado.';
    }

    if (status === 'rejected' || status === 'cancelled') {
      return 'Checklist de salida bloqueado: la reserva fue cancelada o rechazada.';
    }
  }

  return 'Checklist no disponible para el estado actual de la reserva.';
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

export function TripsScreen({ onNavigateToTab }: TripsScreenProps) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const desktopCardStyle = isDesktopWeb ? localStyles.desktopCard : undefined;

  const { userId: authUserId } = useAuthStore();
  const { profile } = useUserProfileStore();

  const hasRequiredProfileData = hasMinimumProfileData(profile);
  const canTransact = canUseTransactionalFlows(profile);

  const [screenMode, setScreenMode] = useState<TripsScreenMode>('list');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [editingChecklistType, setEditingChecklistType] = useState<BookingChecklistType | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [driverBookings, setDriverBookings] = useState<BookingItem[]>([]);
  const [ownerBookings, setOwnerBookings] = useState<BookingItem[]>([]);
  const [roleView, setRoleView] = useState<TripsRoleView>('driver');
  const [userById, setUserById] = useState<Record<string, UserMiniProfile>>({});
  const [vehicleById, setVehicleById] = useState<Record<string, VehicleMiniInfo>>({});

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

  const [ownerContactMethodInput, setOwnerContactMethodInput] = useState('');

  const [checklists, setChecklists] = useState<BookingChecklistItem[]>([]);
  const [checklistDrafts, setChecklistDrafts] = useState<Record<BookingChecklistType, ChecklistDraft>>({
    check_in: emptyChecklistDraft(),
    check_out: emptyChecklistDraft()
  });
  const [checklistSavingType, setChecklistSavingType] = useState<BookingChecklistType | null>(null);

  const [checklistImages, setChecklistImages] = useState<ChecklistImageItem[]>([]);
  const [checklistImagesLoading, setChecklistImagesLoading] = useState(false);
  const [checklistImageUploading, setChecklistImageUploading] = useState(false);
  const [checklistImageDeletingId, setChecklistImageDeletingId] = useState<string | null>(null);
  const [pendingChecklistImages, setPendingChecklistImages] = useState<Record<BookingChecklistType, PendingChecklistImage[]>>({
    check_in: [],
    check_out: []
  });

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewRatingInput, setReviewRatingInput] = useState(5);
  const [reviewCommentInput, setReviewCommentInput] = useState('');
  const [overviewUser, setOverviewUser] = useState<{ id: string; displayName: string; avatarUrl: string | null } | null>(null);

  useEffect(() => {
    if (!mutationMessage) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setMutationMessage(null);
    }, 3800);

    return () => clearTimeout(timeoutId);
  }, [mutationMessage]);

  const loadBookings = useCallback(async () => {
    if (!authUserId) {
      setDriverBookings([]);
      setOwnerBookings([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

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

  const selectedBooking = useMemo(
    () => allBookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [allBookings, selectedBookingId]
  );

  const selectedBookingIsOwnerView = useMemo(
    () => !!selectedBooking && selectedBooking.ownerId === authUserId,
    [selectedBooking, authUserId]
  );

  const selectedBookingCounterpartId = useMemo(() => {
    if (!selectedBooking || !authUserId) {
      return null;
    }

    return selectedBooking.ownerId === authUserId ? selectedBooking.driverId : selectedBooking.ownerId;
  }, [selectedBooking, authUserId]);

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

        setUserById(users.reduce<Record<string, UserMiniProfile>>((acc, user) => ({ ...acc, [user.id]: user }), {}));
        setVehicleById(
          vehicles.reduce<Record<string, VehicleMiniInfo>>((acc, vehicle) => ({ ...acc, [vehicle.id]: vehicle }), {})
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

  const openBookingDetail = (bookingId: string) => {
    setScreenMode('detail');
    setSelectedBookingId(bookingId);
    setMutationError(null);
    setMutationMessage(null);
    setDetailError(null);
    setEditingChecklistType(null);
  };

  const backToList = () => {
    setScreenMode('list');
    setSelectedBookingId(null);
    setEditingChecklistType(null);
    setChecklists([]);
    setChecklistImages([]);
    setReviews([]);
    setChecklistDrafts({ check_in: emptyChecklistDraft(), check_out: emptyChecklistDraft() });
    setPendingChecklistImages({ check_in: [], check_out: [] });
    setReviewCommentInput('');
    setReviewRatingInput(5);
    setOwnerContactMethodInput('');
  };

  const backToDetail = () => {
    setScreenMode('detail');
    setEditingChecklistType(null);
    setChecklistImages([]);
  };

  const loadDetailData = useCallback(async () => {
    if (!selectedBookingId) {
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      const [checklistsResponse, reviewsResponse, bookingResponse] = await Promise.all([
        httpClient.get<BookingChecklistItem[]>(`/booking-checklists?bookingId=${selectedBookingId}`),
        httpClient.get<ReviewItem[]>(`/reviews?bookingId=${selectedBookingId}`),
        httpClient.get<BookingItem>(`/bookings/${selectedBookingId}`)
      ]);

      setChecklists(checklistsResponse.data);
      setReviews(reviewsResponse.data);
      setOwnerContactMethodInput(bookingResponse.data.ownerContactMethod ?? '');

      const nextDrafts: Record<BookingChecklistType, ChecklistDraft> = {
        check_in: emptyChecklistDraft(),
        check_out: emptyChecklistDraft()
      };

      for (const checklist of checklistsResponse.data) {
        nextDrafts[checklist.type] = {
          mileage: String(checklist.mileage),
          fuelLevel: String(checklist.fuelLevel),
          notes: checklist.notes ?? ''
        };
      }

      setChecklistDrafts(nextDrafts);
    } catch (error: unknown) {
      setDetailError(getApiErrorMessage(error) ?? 'No se pudo cargar el detalle transaccional de la reserva.');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedBookingId]);

  useEffect(() => {
    if ((screenMode !== 'detail' && screenMode !== 'checklistEditor' && screenMode !== 'reviewComposer') || !selectedBookingId) {
      return;
    }

    void loadDetailData();
  }, [screenMode, selectedBookingId, loadDetailData]);

  const loadChecklistImages = useCallback(async (checklistId: string) => {
    setChecklistImagesLoading(true);
    try {
      const response = await httpClient.get<ChecklistImageItem[]>(`/checklist-images?checklistId=${checklistId}`);
      setChecklistImages(response.data);
    } catch (error: unknown) {
      setMutationError(getApiErrorMessage(error) ?? 'No se pudieron cargar las imagenes del checklist.');
    } finally {
      setChecklistImagesLoading(false);
    }
  }, []);

  const openChecklistEditor = async (type: BookingChecklistType) => {
    if (!selectedBooking) {
      return;
    }

    if (!canCreateChecklistByRole(selectedBooking, authUserId)) {
      setMutationError('Solo el conductor de la reserva puede crear y enviar checklists.');
      return;
    }

    if (!canOpenChecklist(type, selectedBooking.status)) {
      setMutationError(getChecklistBlockReason(type, selectedBooking.status));
      return;
    }

    setScreenMode('checklistEditor');
    setEditingChecklistType(type);
    setMutationError(null);

    const existingChecklist = checklists.find((item) => item.type === type);
    if (existingChecklist) {
      setMutationError('Este checklist ya fue enviado y no puede volver a editarse.');
      return;
    }

    setChecklistImages([]);
  };

  const refreshAll = async () => {
    await loadBookings();
    if (selectedBookingId) {
      await loadDetailData();
    }
  };

  const handleUpdateBookingStatus = async (nextStatus: BookingStatus) => {
    if (!selectedBooking) {
      return;
    }

    if (!canTransact) {
      setMutationError('Necesitas perfil verificado para operar estados transaccionales. Ve a Perfil.');
      return;
    }

    setStatusUpdating(true);
    setMutationError(null);
    setMutationMessage(null);

    try {
      const payload: { status: BookingStatus; ownerContactMethod?: string } = { status: nextStatus };

      if (selectedBookingIsOwnerView && nextStatus === 'accepted') {
        const contact = ownerContactMethodInput.trim();
        if (!contact) {
          setMutationError('Para aceptar la reserva debes indicar metodo de contacto del propietario.');
          setStatusUpdating(false);
          return;
        }
        payload.ownerContactMethod = contact;
      }

      await httpClient.put(`/bookings/${selectedBooking.id}/status`, payload);
      setMutationMessage(null);
      await refreshAll();
    } catch (error: unknown) {
      setMutationError(getApiErrorMessage(error) ?? 'No se pudo actualizar el estado de la reserva.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSaveChecklist = async (type: BookingChecklistType): Promise<BookingChecklistItem | null> => {
    if (!selectedBooking) {
      return null;
    }

    if (!authUserId) {
      setMutationError('Sesion no valida para enviar checklist.');
      return null;
    }

    if (!canCreateChecklistByRole(selectedBooking, authUserId)) {
      setMutationError('Solo el conductor de la reserva puede crear y enviar checklists.');
      return null;
    }

    if (!canTransact) {
      setMutationError('Necesitas perfil verificado para gestionar checklists. Ve a Perfil.');
      return null;
    }

    const parsed = parseChecklistDraft(checklistDrafts[type]);
    const pendingImagesForType = pendingChecklistImages[type];

    if (!parsed) {
      setMutationError('Checklist invalido: kilometraje >= 0 y combustible entre 0 y 100.');
      return null;
    }

    if (pendingImagesForType.length === 0) {
      setMutationError('Debes añadir al menos una evidencia fotografica antes de enviar el checklist.');
      return null;
    }

    setChecklistSavingType(type);
    setMutationError(null);
    setMutationMessage(null);

    try {
      const existing = checklists.find((item) => item.type === type);
      if (existing) {
        setMutationError('Este checklist ya fue enviado y no puede modificarse.');
        return null;
      }

      const created = await httpClient.post<BookingChecklistItem>('/booking-checklists', {
        bookingId: selectedBooking.id,
        type,
        mileage: parsed.mileage,
        fuelLevel: parsed.fuelLevel,
        notes: parsed.notes ?? undefined
      });

      const checklistId = created.data.id;

      await Promise.all(
        pendingImagesForType.map(async (image) => {
          const uploaded = await uploadImageToApi({
            target: 'checklist_image',
            fileUri: image.fileUri,
            fileName: image.fileName,
            mimeType: image.mimeType,
            ownerId: authUserId,
            webFile: image.webFile
          });

          await httpClient.post('/checklist-images', {
            checklistId,
            imageUrl: uploaded.persistedValue
          });
        })
      );

      setMutationMessage(null);
      await loadDetailData();

      const refreshed = (await httpClient.get<ChecklistImageItem[]>(`/checklist-images?checklistId=${checklistId}`)).data;
      setChecklistImages(refreshed);
      setPendingChecklistImages((prev) => ({
        ...prev,
        [type]: []
      }));
      setScreenMode('detail');
      setEditingChecklistType(null);

      return created.data;
    } catch (error: unknown) {
      setMutationError(getApiErrorMessage(error) ?? 'No se pudo guardar el checklist.');
      return null;
    } finally {
      setChecklistSavingType(null);
    }
  };

  const handleUploadChecklistImage = async () => {
    if (!selectedBooking || !editingChecklistType || !authUserId) {
      return;
    }

    if (!canCreateChecklistByRole(selectedBooking, authUserId)) {
      setMutationError('Solo el conductor de la reserva puede subir evidencias de checklist.');
      return;
    }

    if (!canTransact) {
      setMutationError('Necesitas perfil verificado para subir evidencias del checklist. Ve a Perfil.');
      return;
    }

    setChecklistImageUploading(true);
    setMutationError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: true,
        allowsMultipleSelection: false
      });

      if (result.canceled || !result.assets[0]) {
        setChecklistImageUploading(false);
        return;
      }

      const prepared = await prepareUploadImage(result.assets[0], 'checklist_image');
      setPendingChecklistImages((prev) => ({
        ...prev,
        [editingChecklistType]: [
          ...prev[editingChecklistType],
          {
            previewUri: prepared.fileUri,
            fileUri: prepared.fileUri,
            fileName: prepared.fileName,
            mimeType: prepared.mimeType,
            webFile: prepared.webFile
          }
        ]
      }));

      setMutationMessage(null);
    } catch (error: unknown) {
      setMutationError(getApiErrorMessage(error) ?? 'No se pudo preparar la imagen del checklist.');
    } finally {
      setChecklistImageUploading(false);
    }
  };

  const handleRemovePendingChecklistImage = (type: BookingChecklistType, imageIndex: number) => {
    setPendingChecklistImages((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, index) => index !== imageIndex)
    }));
  };

  const handleDeleteChecklistImage = async (imageId: string, checklistId: string) => {
    setChecklistImageDeletingId(imageId);

    try {
      await httpClient.delete(`/checklist-images/${imageId}`);
      await loadChecklistImages(checklistId);
      setMutationMessage(null);
    } catch (error: unknown) {
      setMutationError(getApiErrorMessage(error) ?? 'No se pudo eliminar la imagen del checklist.');
    } finally {
      setChecklistImageDeletingId(null);
    }
  };

  const handleCreateReview = async () => {
    if (!selectedBooking || !selectedBookingCounterpartId || !authUserId) {
      return;
    }

    if (!canTransact) {
      setMutationError('Necesitas perfil verificado para publicar resenas. Ve a Perfil.');
      return;
    }

    if (selectedBooking.status !== 'completed') {
      setMutationError('Solo puedes valorar reservas completadas.');
      return;
    }

    if (reviewRatingInput < 1 || reviewRatingInput > 5) {
      setMutationError('La valoracion debe estar entre 1 y 5.');
      return;
    }

    setReviewSaving(true);
    setMutationError(null);
    setMutationMessage(null);

    try {
      await httpClient.post('/reviews', {
        bookingId: selectedBooking.id,
        revieweeId: selectedBookingCounterpartId,
        rating: reviewRatingInput,
        comment: reviewCommentInput.trim() || undefined
      });

      setMutationMessage(null);
      setReviewCommentInput('');
      await loadDetailData();
      setScreenMode('detail');
    } catch (error: unknown) {
      setMutationError(getApiErrorMessage(error) ?? 'No se pudo crear la resena.');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleOpenUserOverview = (userId: string, profileData?: UserMiniProfile) => {
    if (authUserId && userId === authUserId) {
      return;
    }

    setOverviewUser({
      id: userId,
      displayName: getUserDisplayName(profileData),
      avatarUrl: profileData?.avatarUrl ?? null
    });
  };

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

  if (screenMode === 'checklistEditor' && selectedBooking && editingChecklistType) {
    const currentChecklist = checklists.find((item) => item.type === editingChecklistType) ?? null;
    const draft = checklistDrafts[editingChecklistType];
    const pendingImagesForType = pendingChecklistImages[editingChecklistType];

    return (
      <View style={styles.sectionCard}>
        <SectionHeader
          title={editingChecklistType === 'check_in' ? 'Checklist de entrada' : 'Checklist de salida'}
          subtitle={`Reserva #${getShortId(selectedBooking.id)} · Evidencias y datos verificables`}
          centered={isDesktopWeb}
        />

        <View style={[styles.actionsRow, desktopCardStyle]}>
          <ActionButton label="Volver al detalle" onPress={backToDetail} variant="ghost" />
          {!currentChecklist ? (
            <ActionButton
              label={checklistSavingType === editingChecklistType ? 'Enviando...' : 'Enviar checklist'}
              onPress={() => void handleSaveChecklist(editingChecklistType)}
              disabled={checklistSavingType === editingChecklistType || !canTransact}
            />
          ) : null}
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <Text style={styles.switcherTitle}>Datos del checklist</Text>
          <TextInput
            value={draft.mileage}
            onChangeText={(value) =>
              setChecklistDrafts((prev) => ({
                ...prev,
                [editingChecklistType]: { ...prev[editingChecklistType], mileage: value }
              }))
            }
            placeholder="Kilometraje"
            keyboardType="numeric"
            style={styles.input}
          />
          <TextInput
            value={draft.fuelLevel}
            onChangeText={(value) =>
              setChecklistDrafts((prev) => ({
                ...prev,
                [editingChecklistType]: { ...prev[editingChecklistType], fuelLevel: value }
              }))
            }
            placeholder="Combustible (0-100)"
            keyboardType="numeric"
            style={styles.input}
          />
          <TextInput
            value={draft.notes}
            onChangeText={(value) =>
              setChecklistDrafts((prev) => ({
                ...prev,
                [editingChecklistType]: { ...prev[editingChecklistType], notes: value }
              }))
            }
            placeholder="Observaciones"
            style={styles.input}
            multiline
          />
          <Text style={styles.linkHint}>Recomendacion: sube fotos claras de 4 lados, cuadro, kilometraje, daños visibles e interior.</Text>
          <Text style={styles.error}>Aviso legal: si faltan evidencias, la plataforma no asume responsabilidad ante reclamaciones no demostrables.</Text>
          {currentChecklist ? <Text style={styles.linkHint}>Checklist enviado: ya no se permite acceso ni edicion posterior.</Text> : null}
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <Text style={styles.switcherTitle}>Evidencias fotograficas</Text>

          <View style={styles.buttonContainer}>
            <ActionButton
              label={checklistImageUploading ? 'Procesando...' : 'Añadir imagen'}
              onPress={() => void handleUploadChecklistImage()}
              disabled={checklistImageUploading || !canTransact || !!currentChecklist}
            />
          </View>

          {!currentChecklist ? (
            <Text style={styles.linkHint}>Las imagenes adjuntas quedaran asociadas al checklist al enviarlo.</Text>
          ) : null}

          {checklistImagesLoading ? <ActivityIndicator size="small" /> : null}

          <View style={[localStyles.imageEvidenceGrid, isDesktopWeb ? localStyles.imageEvidenceGridDesktop : undefined]}>
            {pendingImagesForType.map((image, index) => {
              return (
                <View
                  key={`${image.fileName}-${index}`}
                  style={[localStyles.imageEvidenceCard, isDesktopWeb ? localStyles.imageEvidenceCardDesktop : undefined]}
                >
                  <Image source={{ uri: image.previewUri }} style={localStyles.imageEvidence} resizeMode="cover" />
                  <View style={styles.actionsRow}>
                    <ActionButton
                      label="Quitar del borrador"
                      onPress={() => handleRemovePendingChecklistImage(editingChecklistType, index)}
                      variant="danger"
                      disabled={!!currentChecklist}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {!checklistImagesLoading && pendingImagesForType.length === 0 ? (
            <Text style={styles.linkHint}>Aun no se han añadido evidencias.</Text>
          ) : null}
        </View>

        {mutationError ? <Text style={styles.error}>{mutationError}</Text> : null}
      </View>
    );
  }

  if (screenMode === 'reviewComposer' && selectedBooking) {
    return (
      <View style={styles.sectionCard}>
        <SectionHeader
          title={`Valorar reserva #${getShortId(selectedBooking.id)}`}
          subtitle="Tu reseña quedara visible en Perfil, no en esta reserva."
          centered={isDesktopWeb}
        />

        <View style={[styles.actionsRow, desktopCardStyle]}>
          <ActionButton label="Volver al detalle" onPress={backToDetail} variant="ghost" />
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <Text style={styles.switcherTitle}>Tu puntuacion</Text>
          <View style={localStyles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= reviewRatingInput;
              return (
                <Pressable
                  key={`star-${star}`}
                  onPress={() => setReviewRatingInput(star)}
                  style={[localStyles.starButton, active ? localStyles.starButtonActive : undefined]}
                >
                  <Text style={[localStyles.starButtonText, active ? localStyles.starButtonTextActive : undefined]}>
                    {active ? '★' : '☆'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={reviewCommentInput}
            onChangeText={setReviewCommentInput}
            placeholder="Comentario"
            style={styles.input}
            multiline
          />
          <View style={styles.buttonContainer}>
            <ActionButton
              label={reviewSaving ? 'Publicando...' : 'Enviar reseña'}
              onPress={() => void handleCreateReview()}
              disabled={reviewSaving || !canTransact}
            />
          </View>
        </View>

        {mutationError ? <Text style={styles.error}>{mutationError}</Text> : null}
      </View>
    );
  }

  if (screenMode === 'detail' && selectedBooking) {
    const statusColors = STATUS_COLORS[selectedBooking.status];
    const ownerProfile = userById[selectedBooking.ownerId];
    const driverProfile = userById[selectedBooking.driverId];
    const ownerAvatarUrl = resolveStoredImageUrl(ownerProfile?.avatarUrl ?? null);
    const driverAvatarUrl = resolveStoredImageUrl(driverProfile?.avatarUrl ?? null);
    const vehicleLabel = getVehicleLabel(vehicleById[selectedBooking.vehicleId]);

    const checkInChecklist = checklists.find((item) => item.type === 'check_in') ?? null;
    const checkOutChecklist = checklists.find((item) => item.type === 'check_out') ?? null;
    const myReview = reviews.find((review) => review.reviewerId === authUserId) ?? null;

    const blockedReasons = [
      !canCreateChecklistByRole(selectedBooking, authUserId)
        ? 'Checklist bloqueado: solo el conductor de esta reserva puede crearlo y enviarlo.'
        : null,
      !canOpenChecklist('check_in', selectedBooking.status)
        ? getChecklistBlockReason('check_in', selectedBooking.status)
        : null,
      !canOpenChecklist('check_out', selectedBooking.status)
        ? getChecklistBlockReason('check_out', selectedBooking.status)
        : null,
      selectedBooking.status !== 'completed'
        ? 'Reseña bloqueada: solo disponible cuando la reserva este completada.'
        : null
    ].filter(Boolean) as string[];

    return (
      <View style={styles.sectionCard}>
        <SectionHeader
          title={`Reserva #${getShortId(selectedBooking.id)}`}
          subtitle="Detalle transaccional con acciones por estado y rol."
          centered={isDesktopWeb}
        />

        <View style={[styles.actionsRow, desktopCardStyle]}>
          <ActionButton label="Volver a lista" onPress={backToList} variant="ghost" />
        </View>

        {!hasRequiredProfileData ? (
          <View style={[styles.card, desktopCardStyle]}>
            <Text style={styles.error}>Completa nombre, apellidos y telefono en Perfil para operar flujos transaccionales.</Text>
            {onNavigateToTab ? (
              <View style={styles.buttonContainer}>
                <ActionButton label="Ir a Perfil" onPress={() => onNavigateToTab('profile')} />
              </View>
            ) : null}
          </View>
        ) : null}

        {!canTransact ? (
          <View style={[styles.card, desktopCardStyle]}>
            <Text style={styles.error}>Necesitas verificacion documental para ejecutar acciones transaccionales.</Text>
            {onNavigateToTab ? (
              <View style={styles.buttonContainer}>
                <ActionButton label="Ir a Perfil > Documentacion" onPress={() => onNavigateToTab('profile')} />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.card, desktopCardStyle]}>
          <View style={localStyles.bookingHeaderRow}>
            <Text style={styles.cardTitle}>{vehicleLabel}</Text>
            <View style={[localStyles.statusPill, { backgroundColor: statusColors.background }]}> 
              <Text style={[localStyles.statusPillText, { color: statusColors.text }]}>{STATUS_LABEL[selectedBooking.status]}</Text>
            </View>
          </View>

          <Text style={styles.row}><Text style={styles.label}>Periodo:</Text> {formatDateTime(selectedBooking.startDatetime)} - {formatDateTime(selectedBooking.endDatetime)}</Text>
          <Text style={styles.row}><Text style={styles.label}>Duracion:</Text> {getDurationDays(selectedBooking.startDatetime, selectedBooking.endDatetime)} dias</Text>
          <Text style={styles.row}><Text style={styles.label}>Total:</Text> {formatCurrency(selectedBooking.totalPrice)}</Text>
          <Text style={styles.row}><Text style={styles.label}>Comision:</Text> {formatCurrency(selectedBooking.platformFee)}</Text>
          <Text style={styles.row}><Text style={styles.label}>Payout:</Text> {selectedBooking.payoutStatus}</Text>
          <Text style={styles.row}><Text style={styles.label}>Contacto owner:</Text> {selectedBooking.ownerContactMethod ?? 'No definido'}</Text>
          <Text style={styles.linkHint}>Creada el {formatDateTime(selectedBooking.createdAt)}</Text>

          <View style={localStyles.peopleSection}>
            <Pressable style={localStyles.personRow} onPress={() => handleOpenUserOverview(selectedBooking.ownerId, ownerProfile)}>
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
            </Pressable>

            <Pressable style={localStyles.personRow} onPress={() => handleOpenUserOverview(selectedBooking.driverId, driverProfile)}>
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
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <Text style={styles.switcherTitle}>Siguientes acciones</Text>

          {selectedBookingIsOwnerView && selectedBooking.status === 'pending' ? (
            <>
              <TextInput
                value={ownerContactMethodInput}
                onChangeText={setOwnerContactMethodInput}
                placeholder="Metodo de contacto del propietario"
                style={styles.input}
              />
              <View style={styles.actionsRow}>
                <ActionButton label="Aceptar" onPress={() => void handleUpdateBookingStatus('accepted')} disabled={statusUpdating || !canTransact} />
                <ActionButton label="Rechazar" variant="danger" onPress={() => void handleUpdateBookingStatus('rejected')} disabled={statusUpdating || !canTransact} />
                <ActionButton label="Cancelar" variant="ghost" onPress={() => void handleUpdateBookingStatus('cancelled')} disabled={statusUpdating || !canTransact} />
              </View>
            </>
          ) : null}

          {selectedBookingIsOwnerView && selectedBooking.status === 'accepted' ? (
            <View style={styles.actionsRow}>
              <ActionButton label="Cancelar" variant="ghost" onPress={() => void handleUpdateBookingStatus('cancelled')} disabled={statusUpdating || !canTransact} />
            </View>
          ) : null}

          {selectedBookingIsOwnerView && selectedBooking.status === 'paid_confirmed' ? (
            <View style={styles.actionsRow}>
              <ActionButton label="Iniciar viaje" onPress={() => void handleUpdateBookingStatus('in_progress')} disabled={statusUpdating || !canTransact} />
              <ActionButton label="Cancelar" variant="ghost" onPress={() => void handleUpdateBookingStatus('cancelled')} disabled={statusUpdating || !canTransact} />
            </View>
          ) : null}

          {selectedBookingIsOwnerView && selectedBooking.status === 'in_progress' ? (
            <View style={styles.actionsRow}>
              <ActionButton label="Marcar completada" onPress={() => void handleUpdateBookingStatus('completed')} disabled={statusUpdating || !canTransact} />
            </View>
          ) : null}

          {!selectedBookingIsOwnerView && selectedBooking.status === 'pending' ? (
            <View style={styles.actionsRow}>
              <ActionButton label="Cancelar solicitud" variant="ghost" onPress={() => void handleUpdateBookingStatus('cancelled')} disabled={statusUpdating || !canTransact} />
            </View>
          ) : null}

          {!selectedBookingIsOwnerView && selectedBooking.status === 'accepted' ? (
            <View style={styles.actionsRow}>
              <PaymentAction
                bookingId={selectedBooking.id}
                disabled={statusUpdating || !canTransact}
                renderButton={(buttonProps) => <ActionButton {...buttonProps} />}
                onDemoConfirm={() => void handleUpdateBookingStatus('paid_confirmed')}
                onPaid={refreshAll}
              />
            </View>
          ) : null}

          {!selectedBookingIsOwnerView && selectedBooking.status === 'paid_confirmed' ? (
            <View style={styles.actionsRow}>
              <ActionButton label="Cancelar" variant="ghost" onPress={() => void handleUpdateBookingStatus('cancelled')} disabled={statusUpdating || !canTransact} />
            </View>
          ) : null}

          {(selectedBooking.status === 'rejected' || selectedBooking.status === 'cancelled' || selectedBooking.status === 'completed') && (
            <Text style={styles.linkHint}>No hay transiciones adicionales disponibles para este estado.</Text>
          )}
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <Text style={styles.switcherTitle}>Checklists</Text>

          <View style={localStyles.checklistSummaryCard}>
            <Text style={styles.row}><Text style={styles.label}>Entrada:</Text> {checkInChecklist ? 'Guardado' : 'Pendiente'}</Text>
            <Text style={styles.row}><Text style={styles.label}>Salida:</Text> {checkOutChecklist ? 'Guardado' : 'Pendiente'}</Text>

            <View style={styles.actionsRow}>
              {canCreateChecklistByRole(selectedBooking, authUserId) && canOpenChecklist('check_in', selectedBooking.status) && !checkInChecklist ? (
                <ActionButton
                  label="Crear checklist entrada"
                  onPress={() => void openChecklistEditor('check_in')}
                  disabled={!canTransact}
                />
              ) : null}

              {canCreateChecklistByRole(selectedBooking, authUserId) && canOpenChecklist('check_out', selectedBooking.status) && !checkOutChecklist ? (
                <ActionButton
                  label="Crear checklist salida"
                  onPress={() => void openChecklistEditor('check_out')}
                  disabled={!canTransact}
                  variant="ghost"
                />
              ) : null}
            </View>

            {blockedReasons.map((reason, index) => (
              <Text key={`block-${index}`} style={styles.linkHint}>• {reason}</Text>
            ))}
          </View>
        </View>

        <View style={[styles.card, desktopCardStyle]}>
          <Text style={styles.switcherTitle}>Reseña</Text>

          {selectedBooking.status !== 'completed' ? (
            <Text style={styles.linkHint}>Aun no puedes emitir reseña: la reserva no esta completada.</Text>
          ) : null}

          {selectedBooking.status === 'completed' && myReview ? (
            <Text style={styles.linkHint}>Ya emitiste tu reseña. Esta visible desde Perfil.</Text>
          ) : null}

          {selectedBooking.status === 'completed' && !myReview ? (
            <View style={styles.buttonContainer}>
              <ActionButton
                label="Emitir reseña"
                onPress={() => {
                  setScreenMode('reviewComposer');
                  setMutationError(null);
                }}
                disabled={!canTransact}
              />
            </View>
          ) : null}
        </View>

        {detailLoading ? <ActivityIndicator size="small" /> : null}
        {detailError ? <Text style={styles.error}>{detailError}</Text> : null}
        {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
        {mutationError ? <Text style={styles.error}>{mutationError}</Text> : null}

        <UserOverviewModal
          visible={!!overviewUser}
          userId={overviewUser?.id ?? null}
          displayName={overviewUser?.displayName ?? 'Usuario'}
          avatarUrl={overviewUser?.avatarUrl ?? null}
          onClose={() => setOverviewUser(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.sectionCard}>
      <SectionHeader
        title="Mis Viajes"
        subtitle="Consulta tus reservas y entra al detalle transaccional de cada una."
        centered={isDesktopWeb}
      />

      <View style={[styles.card, desktopCardStyle]}>
        <Text style={styles.switcherTitle}>Vista</Text>
        <View style={styles.actionsRow}>
          <Pressable
            style={[localStyles.roleButton, roleView === 'driver' ? localStyles.roleButtonActive : undefined]}
            onPress={() => setRoleView('driver')}
          >
            <Text style={[localStyles.roleButtonText, roleView === 'driver' ? localStyles.roleButtonTextActive : undefined]}>
              Como conductor
            </Text>
          </Pressable>
          <Pressable
            style={[localStyles.roleButton, roleView === 'owner' ? localStyles.roleButtonActive : undefined]}
            onPress={() => setRoleView('owner')}
          >
            <Text style={[localStyles.roleButtonText, roleView === 'owner' ? localStyles.roleButtonTextActive : undefined]}>
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
        <ActionButton label="Recargar reservas" onPress={() => void loadBookings()} variant="ghost" />
      </View>

      {loading ? <ActivityIndicator size="small" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
      {mutationError ? <Text style={styles.error}>{mutationError}</Text> : null}

      {sortedBookings.map((booking) => {
        const statusColors = STATUS_COLORS[booking.status];
        const vehicleLabel = getVehicleLabel(vehicleById[booking.vehicleId]);

        return (
          <Pressable key={booking.id} onPress={() => openBookingDetail(booking.id)}>
            <View style={[styles.card, desktopCardStyle]}>
              <View style={localStyles.bookingHeaderRow}>
                <Text style={styles.cardTitle}>Reserva #{getShortId(booking.id)}</Text>
                <View style={[localStyles.statusPill, { backgroundColor: statusColors.background }]}> 
                  <Text style={[localStyles.statusPillText, { color: statusColors.text }]}>{STATUS_LABEL[booking.status]}</Text>
                </View>
              </View>

              <Text style={styles.row}><Text style={styles.label}>Vehiculo:</Text> {vehicleLabel}</Text>
              <Text style={styles.row}><Text style={styles.label}>Periodo:</Text> {formatDateTime(booking.startDatetime)} - {formatDateTime(booking.endDatetime)}</Text>
              <Text style={styles.row}><Text style={styles.label}>Total:</Text> {formatCurrency(booking.totalPrice)}</Text>
              <Text style={styles.linkHint}>Toca para ver acciones y flujo transaccional.</Text>
              {canCancelBooking(booking) ? <Text style={styles.linkHint}>Cancelable antes de inicio.</Text> : null}
            </View>
          </Pressable>
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

      <UserOverviewModal
        visible={!!overviewUser}
        userId={overviewUser?.id ?? null}
        displayName={overviewUser?.displayName ?? 'Usuario'}
        avatarUrl={overviewUser?.avatarUrl ?? null}
        onClose={() => setOverviewUser(null)}
      />
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
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    backgroundColor: colorTokens.white
  },
  roleButtonActive: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  roleButtonText: {
    textAlign: 'center',
    color: colorTokens.secondary,
    ...typographyTokens.caption,
    fontWeight: '600'
  },
  roleButtonTextActive: {
    color: colorTokens.white,
    fontWeight: '700'
  },
  bookingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  statusPill: {
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs
  },
  statusPillText: {
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  peopleSection: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    padding: spacingTokens.md,
    gap: spacingTokens.sm,
    backgroundColor: colorTokens.white
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  personAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colorTokens.bgLight
  },
  personAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.bgLight
  },
  personAvatarFallbackText: {
    ...typographyTokens.caption,
    fontWeight: '700',
    color: colorTokens.secondary
  },
  personInfo: {
    flex: 1
  },
  personRoleLabel: {
    ...typographyTokens.caption,
    color: colorTokens.textMuted
  },
  personName: {
    ...typographyTokens.body,
    fontWeight: '700',
    color: colorTokens.primary
  },
  checklistSummaryCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    padding: spacingTokens.md,
    gap: spacingTokens.sm,
    backgroundColor: colorTokens.white
  },
  imageEvidenceCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    padding: spacingTokens.sm,
    gap: spacingTokens.sm,
    marginTop: spacingTokens.sm,
    backgroundColor: colorTokens.white
  },
  imageEvidenceGrid: {
    width: '100%',
    gap: spacingTokens.sm
  },
  imageEvidenceGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  imageEvidenceCardDesktop: {
    width: '49%'
  },
  imageEvidence: {
    width: '100%',
    height: 180,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  imageEvidenceFallback: {
    width: '100%',
    height: 120,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionButton: {
    minHeight: 46,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    borderColor: colorTokens.primary,
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
  actionButtonDanger: {
    backgroundColor: colorTokens.alert,
    borderColor: colorTokens.alert
  },
  actionButtonDisabled: {
    opacity: 0.6
  },
  actionButtonText: {
    ...typographyTokens.caption,
    fontWeight: '700',
    color: colorTokens.white,
    textAlign: 'center'
  },
  actionButtonGhostText: {
    color: colorTokens.secondary
  },
  actionButtonDangerText: {
    color: colorTokens.white
  },
  feedbackBanner: {
    width: '100%',
    marginTop: spacingTokens.sm,
    alignItems: 'flex-start'
  },
  feedbackBannerDesktop: {
    alignItems: 'center'
  },
  feedbackBannerText: {
    textAlign: 'center'
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    marginBottom: spacingTokens.sm
  },
  starButton: {
    width: 42,
    height: 42,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    borderColor: colorTokens.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.white
  },
  starButtonActive: {
    borderColor: '#f4b400',
    backgroundColor: '#fff7dc'
  },
  starButtonText: {
    fontSize: 22,
    color: '#9aa0a6'
  },
  starButtonTextActive: {
    color: '#f4b400'
  }
});
