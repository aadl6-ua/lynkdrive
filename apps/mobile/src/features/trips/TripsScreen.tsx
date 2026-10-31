import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { httpClient } from '../../api/http';
import { prepareUploadImage } from '../../api/prepareUploadImage';
import { resolveStoredImageUrl } from '../../api/storage';
import { uploadImageToApi } from '../../api/uploads';
import { colorTokens, layoutTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { AppTabKey } from '../../app/types';
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  BOOKING_TIMELINE,
  BookingStatus,
  PAYOUT_STATUS_LABEL,
  isBookingActive,
  isBookingBillable
} from '../../shared/booking';
import { UserOverviewModal } from '../../shared/components/UserOverviewModal';
import { getApiErrorMessage } from '../../shared/errors';
import {
  formatCurrencyEUR,
  formatDateRangeMadrid,
  formatDateTimeMadrid,
  formatRelativeFromNow,
  getBillableDays,
  getDisplayName,
  pluralize
} from '../../shared/format';
import { ImagePermissionError, ImageSource, pickImages } from '../../shared/imagePicker';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineMessage,
  KeyValueRow,
  ListItemSkeleton,
  PhotoGrid,
  PhotoItem,
  Screen,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
  Skeleton,
  StarRating,
  StatusChip,
  TextField,
  VerificationGate,
  confirmAction,
  toast
} from '../../shared/ui';
import { PaymentAction } from '../payments/PaymentAction';
import { useBackHandler } from '../../shared/useBackHandler';
import { canUseTransactionalFlows, hasMinimumProfileData } from '../../shared/verification';
import { useAuthStore } from '../../store/useAuthStore';
import { usePushNotificationsStore } from '../../store/usePushNotificationsStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';

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

type ChecklistDraft = {
  mileage: string;
  fuelLevel: string;
  notes: string;
};

/** Foto de evidencia local: se comprime al añadirla y se sube al enviar. */
type DraftPhoto = {
  key: string;
  previewUri: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  webFile?: File;
  status: 'processing' | 'ready' | 'uploading' | 'error' | 'done';
  progress?: number;
  errorMessage?: string;
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
  topPadding?: number;
  bottomPadding?: number;
  onNavigateToTab?: (tab: AppTabKey) => void;
};

const CHECKLIST_LABEL: Record<BookingChecklistType, string> = {
  check_in: 'Entrega (check-in)',
  check_out: 'Devolución (check-out)'
};

const FUEL_PRESETS = ['0', '25', '50', '75', '100'];
const MAX_CHECKLIST_PHOTOS = 12;
const REVIEW_MAX_LENGTH = 500;

let photoSeq = 0;

function emptyChecklistDraft(): ChecklistDraft {
  return { mileage: '', fuelLevel: '', notes: '' };
}

function getShortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function getVehicleLabel(vehicle?: VehicleMiniInfo): string {
  return vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo';
}

function validateChecklistDraft(draft: ChecklistDraft): { mileage?: string; fuelLevel?: string } {
  const errors: { mileage?: string; fuelLevel?: string } = {};
  const mileage = Number(draft.mileage.replace(/\./g, '').replace(',', '.'));
  const fuelLevel = Number(draft.fuelLevel);

  if (!draft.mileage.trim()) {
    errors.mileage = 'Indica los kilómetros del cuentakilómetros.';
  } else if (!Number.isInteger(mileage) || mileage < 0) {
    errors.mileage = 'Usa un número entero de kilómetros (sin decimales).';
  }

  if (!draft.fuelLevel.trim()) {
    errors.fuelLevel = 'Indica el nivel de combustible.';
  } else if (!Number.isInteger(fuelLevel) || fuelLevel < 0 || fuelLevel > 100) {
    errors.fuelLevel = 'Debe ser un número entero entre 0 y 100.';
  }

  return errors;
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
  if (status === 'rejected' || status === 'cancelled') {
    return 'La reserva fue cancelada o rechazada.';
  }

  if (type === 'check_in') {
    return 'Disponible cuando el pago esté confirmado.';
  }

  return 'Disponible cuando el viaje esté en curso.';
}

/** Política de cancelación Demo 1 (informativa; el backend aplica la regla). */
function getCancellationNote(booking: BookingItem): string {
  if (booking.status === 'pending' || booking.status === 'accepted') {
    return 'Todavía no hay pago: la cancelación no tiene coste.';
  }

  const hoursToStart = (new Date(booking.startDatetime).getTime() - Date.now()) / 3_600_000;

  if (hoursToStart >= 48) {
    return 'Faltan más de 48 h para el inicio: cancelación gratuita con reembolso completo.';
  }

  if (hoursToStart >= 24) {
    return 'Faltan menos de 48 h: se reembolsará el 50% del importe.';
  }

  return 'Faltan menos de 24 h: la cancelación no tiene reembolso.';
}

export function TripsScreen({ topPadding = 0, bottomPadding = 0, onNavigateToTab }: TripsScreenProps) {
  const { userId: authUserId } = useAuthStore();
  const { profile } = useUserProfileStore();

  const hasRequiredProfileData = hasMinimumProfileData(profile);
  const canTransact = canUseTransactionalFlows(profile);
  const goToProfile = onNavigateToTab ? () => onNavigateToTab('profile') : undefined;

  const [screenMode, setScreenMode] = useState<TripsScreenMode>('list');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [editingChecklistType, setEditingChecklistType] = useState<BookingChecklistType | null>(null);

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverBookings, setDriverBookings] = useState<BookingItem[]>([]);
  const [ownerBookings, setOwnerBookings] = useState<BookingItem[]>([]);
  const [roleView, setRoleView] = useState<TripsRoleView>('driver');
  /** La vista inicial se elige una sola vez; después manda la elección del usuario. */
  const roleViewChosenRef = useRef(false);
  const [userById, setUserById] = useState<Record<string, UserMiniProfile>>({});
  const [vehicleById, setVehicleById] = useState<Record<string, VehicleMiniInfo>>({});

  const [statusUpdating, setStatusUpdating] = useState<BookingStatus | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [ownerContactMethodInput, setOwnerContactMethodInput] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);

  const [checklists, setChecklists] = useState<BookingChecklistItem[]>([]);
  const [checklistImageCount, setChecklistImageCount] = useState<Record<string, number>>({});
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraft>(emptyChecklistDraft());
  const [checklistErrors, setChecklistErrors] = useState<{ mileage?: string; fuelLevel?: string; photos?: string }>({});
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);
  /** Checklist ya creado en esta sesión de edición (para reintentar fotos sin duplicarlo). */
  const [createdChecklistId, setCreatedChecklistId] = useState<string | null>(null);

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewRatingInput, setReviewRatingInput] = useState(0);
  const [reviewCommentInput, setReviewCommentInput] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [overviewUser, setOverviewUser] = useState<{ id: string; displayName: string; avatarUrl: string | null } | null>(
    null
  );

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
      setLoaded(true);

      if (!roleViewChosenRef.current) {
        roleViewChosenRef.current = true;
        // Abre en Propietario si ahí hay solicitudes por responder y como conductor no hay nada pendiente.
        const ownerHasPending = ownerResponse.data.some((booking) => booking.status === 'pending');
        const driverHasAction = driverResponse.data.some((booking) => booking.status === 'accepted');

        if ((ownerHasPending && !driverHasAction) || (driverResponse.data.length === 0 && ownerResponse.data.length > 0)) {
          setRoleView('owner');
        }
      }
    } catch (loadError: unknown) {
      setError(getApiErrorMessage(loadError, 'No se pudieron cargar tus reservas.'));
    } finally {
      setLoading(false);
    }
  }, [authUserId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const allBookings = useMemo(() => [...driverBookings, ...ownerBookings], [driverBookings, ownerBookings]);
  const activeBookings = roleView === 'driver' ? driverBookings : ownerBookings;

  const sortedBookings = useMemo(
    () => [...activeBookings].sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime()),
    [activeBookings]
  );
  const upcomingBookings = useMemo(
    () =>
      sortedBookings
        .filter((booking) => isBookingActive(booking.status))
        .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()),
    [sortedBookings]
  );
  const pastBookings = useMemo(
    () => sortedBookings.filter((booking) => !isBookingActive(booking.status)),
    [sortedBookings]
  );

  const bookingSummary = useMemo(() => {
    const billable = activeBookings.filter((booking) => isBookingBillable(booking.status));
    return {
      active: activeBookings.filter((booking) => isBookingActive(booking.status)).length,
      completed: activeBookings.filter((booking) => booking.status === 'completed').length,
      totalAmount: billable.reduce((sum, booking) => sum + Number(booking.totalPrice), 0)
    };
  }, [activeBookings]);

  // Reservas que esperan una acción del usuario (para el contador de las pestañas).
  const ownerPendingCount = ownerBookings.filter((booking) => booking.status === 'pending').length;
  const driverPendingCount = driverBookings.filter((booking) => booking.status === 'accepted').length;

  const selectedBooking = useMemo(
    () => allBookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [allBookings, selectedBookingId]
  );

  const selectedBookingIsOwnerView = !!selectedBooking && selectedBooking.ownerId === authUserId;

  const selectedBookingCounterpartId = useMemo(() => {
    if (!selectedBooking || !authUserId) {
      return null;
    }

    return selectedBooking.ownerId === authUserId ? selectedBooking.driverId : selectedBooking.ownerId;
  }, [selectedBooking, authUserId]);

  const relatedKey = useMemo(() => {
    const users = Array.from(new Set(allBookings.flatMap((booking) => [booking.ownerId, booking.driverId]))).sort();
    const vehicles = Array.from(new Set(allBookings.map((booking) => booking.vehicleId))).sort();
    return `${users.join('|')}#${vehicles.join('|')}`;
  }, [allBookings]);

  useEffect(() => {
    const [usersPart, vehiclesPart] = relatedKey.split('#');
    const userIds = usersPart ? usersPart.split('|') : [];
    const vehicleIds = vehiclesPart ? vehiclesPart.split('|') : [];

    if (userIds.length === 0 && vehicleIds.length === 0) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      const [users, vehicles] = await Promise.all([
        Promise.allSettled(userIds.map(async (id) => (await httpClient.get<UserMiniProfile>(`/users/${id}`)).data)),
        Promise.allSettled(vehicleIds.map(async (id) => (await httpClient.get<VehicleMiniInfo>(`/vehicles/${id}`)).data))
      ]);

      if (isCancelled) {
        return;
      }

      setUserById((current) => {
        const next = { ...current };
        users.forEach((result) => {
          if (result.status === 'fulfilled') {
            next[result.value.id] = result.value;
          }
        });
        return next;
      });
      setVehicleById((current) => {
        const next = { ...current };
        vehicles.forEach((result) => {
          if (result.status === 'fulfilled') {
            next[result.value.id] = result.value;
          }
        });
        return next;
      });
    })();

    return () => {
      isCancelled = true;
    };
  }, [relatedKey]);

  const loadDetailData = useCallback(async () => {
    if (!selectedBookingId) {
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      const [checklistsResponse, reviewsResponse, bookingResponse] = await Promise.all([
        httpClient.get<BookingChecklistItem[]>('/booking-checklists', { params: { bookingId: selectedBookingId } }),
        httpClient.get<ReviewItem[]>('/reviews', { params: { bookingId: selectedBookingId } }),
        httpClient.get<BookingItem>(`/bookings/${selectedBookingId}`)
      ]);

      setChecklists(checklistsResponse.data);
      setReviews(reviewsResponse.data);
      setOwnerContactMethodInput((current) => current || bookingResponse.data.ownerContactMethod || '');

      const counts = await Promise.allSettled(
        checklistsResponse.data.map(async (checklist) => {
          const response = await httpClient.get<ChecklistImageItem[]>('/checklist-images', {
            params: { checklistId: checklist.id }
          });
          return [checklist.id, response.data.length] as const;
        })
      );
      setChecklistImageCount(
        Object.fromEntries(
          counts.filter((result) => result.status === 'fulfilled').map((result) => (result as PromiseFulfilledResult<readonly [string, number]>).value)
        )
      );
    } catch (loadError: unknown) {
      setDetailError(getApiErrorMessage(loadError, 'No se pudo cargar el detalle de la reserva.'));
    } finally {
      setDetailLoading(false);
    }
  }, [selectedBookingId]);

  useEffect(() => {
    if (screenMode === 'list' || !selectedBookingId) {
      return;
    }

    void loadDetailData();
  }, [screenMode, selectedBookingId, loadDetailData]);

  const openBookingDetail = (bookingId: string) => {
    setScreenMode('detail');
    setSelectedBookingId(bookingId);
    setActionError(null);
    setContactError(null);
    setDetailError(null);
    setChecklists([]);
    setReviews([]);
    setChecklistImageCount({});
    setOwnerContactMethodInput('');
    setEditingChecklistType(null);
  };

  // Al tocar una notificación push se abre el detalle de esa reserva (recargando la lista primero).
  const pendingPushBookingId = usePushNotificationsStore((state) => state.pendingBookingId);
  const consumePendingPushBooking = usePushNotificationsStore((state) => state.consumePendingBooking);
  const [pushOpenedBookingId, setPushOpenedBookingId] = useState<string | null>(null);

  useEffect(() => {
    const bookingId = pendingPushBookingId ? consumePendingPushBooking() : null;

    if (!bookingId) {
      return;
    }

    void loadBookings().then(() => {
      openBookingDetail(bookingId);
      setPushOpenedBookingId(bookingId);
    });
  }, [pendingPushBookingId, consumePendingPushBooking, loadBookings]);

  useEffect(() => {
    const booking = pushOpenedBookingId ? allBookings.find((item) => item.id === pushOpenedBookingId) : null;

    if (booking) {
      setRoleView(booking.ownerId === authUserId ? 'owner' : 'driver');
      setPushOpenedBookingId(null);
    }
  }, [pushOpenedBookingId, allBookings, authUserId]);

  const backToList = () => {
    setScreenMode('list');
    setSelectedBookingId(null);
    setEditingChecklistType(null);
    setChecklists([]);
    setReviews([]);
    setDraftPhotos([]);
    setChecklistDraft(emptyChecklistDraft());
    setReviewCommentInput('');
    setReviewRatingInput(0);
    setOwnerContactMethodInput('');
  };

  const backToDetail = async () => {
    const hasUnsent =
      screenMode === 'checklistEditor' &&
      !createdChecklistId &&
      (draftPhotos.length > 0 || checklistDraft.mileage.trim() || checklistDraft.notes.trim());

    if (hasUnsent) {
      const confirmed = await confirmAction({
        title: '¿Descartar el checklist?',
        message: 'Perderás los datos y las fotos que has añadido.',
        confirmLabel: 'Descartar',
        destructive: true
      });

      if (!confirmed) {
        return;
      }
    }

    setScreenMode('detail');
    setEditingChecklistType(null);
    setDraftPhotos([]);
    setCreatedChecklistId(null);
  };

  useBackHandler(screenMode !== 'list', () => {
    if (screenMode === 'detail') {
      backToList();
    } else {
      void backToDetail();
    }
  });

  const refreshAll = async () => {
    await loadBookings();
    if (selectedBookingId) {
      await loadDetailData();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const openChecklistEditor = (type: BookingChecklistType) => {
    if (!selectedBooking) {
      return;
    }

    setChecklistDraft(emptyChecklistDraft());
    setChecklistErrors({});
    setDraftPhotos([]);
    setCreatedChecklistId(null);
    setEditingChecklistType(type);
    setScreenMode('checklistEditor');
  };

  const handleUpdateBookingStatus = async (nextStatus: BookingStatus) => {
    if (!selectedBooking) {
      return;
    }

    if (!canTransact) {
      setActionError('Necesitas el perfil verificado para gestionar reservas.');
      return;
    }

    const payload: { status: BookingStatus; ownerContactMethod?: string } = { status: nextStatus };

    if (selectedBookingIsOwnerView && nextStatus === 'accepted') {
      const contact = ownerContactMethodInput.trim();
      if (!contact) {
        setContactError('Indica cómo te contactará el conductor (teléfono, email…).');
        return;
      }
      payload.ownerContactMethod = contact;
    }

    const confirmations: Partial<Record<BookingStatus, Parameters<typeof confirmAction>[0]>> = {
      rejected: {
        title: '¿Rechazar la solicitud?',
        message: 'El conductor recibirá la respuesta y no podrá deshacerse.',
        confirmLabel: 'Rechazar',
        destructive: true
      },
      cancelled: {
        title: selectedBooking.status === 'pending' ? '¿Cancelar la solicitud?' : '¿Cancelar la reserva?',
        message: getCancellationNote(selectedBooking),
        confirmLabel: 'Sí, cancelar',
        cancelLabel: 'Volver',
        destructive: true
      },
      paid_confirmed: {
        title: 'Confirmar pago',
        // Este camino solo se usa en modo prototipo (con Stripe paga el PaymentSheet).
        message: `Modo demostración: no se hará ningún cargo real. La reserva de ${formatCurrencyEUR(selectedBooking.totalPrice)} quedará confirmada.`,
        confirmLabel: 'Pagar'
      },
      in_progress: {
        title: '¿Iniciar el viaje?',
        message: 'Confirma que has entregado las llaves al conductor.',
        confirmLabel: 'Iniciar viaje'
      },
      completed: {
        title: '¿Marcar como completada?',
        message: 'Confirma que el vehículo ha sido devuelto.',
        confirmLabel: 'Completar'
      }
    };

    const confirmation = confirmations[nextStatus];
    if (confirmation && !(await confirmAction(confirmation))) {
      return;
    }

    setStatusUpdating(nextStatus);
    setActionError(null);
    setContactError(null);

    try {
      await httpClient.put(`/bookings/${selectedBooking.id}/status`, payload);
      toast.success(`Reserva actualizada: ${BOOKING_STATUS_LABEL[nextStatus].toLowerCase()}.`);
      await refreshAll();
    } catch (updateError: unknown) {
      setActionError(getApiErrorMessage(updateError, 'No se pudo actualizar el estado de la reserva.'));
    } finally {
      setStatusUpdating(null);
    }
  };

  /* ---------------------------- Fotos del checklist ---------------------------- */

  const handleAddChecklistPhotos = async (source: ImageSource) => {
    try {
      const assets = await pickImages(source, {
        multiple: true,
        selectionLimit: MAX_CHECKLIST_PHOTOS - draftPhotos.length
      });

      if (assets.length === 0) {
        return;
      }

      const allowed = assets.slice(0, MAX_CHECKLIST_PHOTOS - draftPhotos.length);
      const placeholders: DraftPhoto[] = allowed.map((asset) => ({
        key: `photo-${++photoSeq}`,
        previewUri: asset.uri,
        fileUri: asset.uri,
        fileName: asset.fileName ?? 'evidencia.jpg',
        mimeType: 'image/jpeg',
        status: 'processing'
      }));

      setDraftPhotos((current) => [...current, ...placeholders]);
      setChecklistErrors((current) => ({ ...current, photos: undefined }));

      // Comprimimos cada foto en segundo plano mostrando su estado individual.
      await Promise.all(
        allowed.map(async (asset, index) => {
          const key = placeholders[index].key;
          try {
            const prepared = await prepareUploadImage(asset, 'checklist_image');
            setDraftPhotos((current) =>
              current.map((photo) =>
                photo.key === key
                  ? {
                      ...photo,
                      previewUri: prepared.fileUri,
                      fileUri: prepared.fileUri,
                      fileName: prepared.fileName,
                      mimeType: prepared.mimeType,
                      webFile: prepared.webFile,
                      status: 'ready'
                    }
                  : photo
              )
            );
          } catch {
            setDraftPhotos((current) =>
              current.map((photo) =>
                photo.key === key ? { ...photo, status: 'error', errorMessage: 'No se pudo optimizar' } : photo
              )
            );
          }
        })
      );
    } catch (pickError: unknown) {
      toast.error(
        pickError instanceof ImagePermissionError ? pickError.message : 'No se pudo abrir el selector de fotos.'
      );
    }
  };

  const handleRemoveDraftPhoto = async (item: PhotoItem) => {
    const confirmed = await confirmAction({
      title: '¿Quitar esta foto?',
      message: 'Se eliminará del checklist antes de enviarlo.',
      confirmLabel: 'Quitar',
      destructive: true
    });

    if (confirmed) {
      setDraftPhotos((current) => current.filter((photo) => photo.key !== item.key));
    }
  };

  const uploadDraftPhoto = async (photo: DraftPhoto, checklistId: string): Promise<boolean> => {
    if (!authUserId) {
      return false;
    }

    const update = (patch: Partial<DraftPhoto>) =>
      setDraftPhotos((current) => current.map((item) => (item.key === photo.key ? { ...item, ...patch } : item)));

    update({ status: 'uploading', progress: 0, errorMessage: undefined });

    try {
      const uploaded = await uploadImageToApi({
        target: 'checklist_image',
        fileUri: photo.fileUri,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        ownerId: authUserId,
        webFile: photo.webFile,
        onProgress: (fraction) => update({ progress: fraction })
      });

      await httpClient.post('/checklist-images', { checklistId, imageUrl: uploaded.persistedValue });
      update({ status: 'done', progress: 1 });
      return true;
    } catch (uploadError: unknown) {
      update({ status: 'error', errorMessage: getApiErrorMessage(uploadError, 'Error al subir') });
      return false;
    }
  };

  const finishChecklist = async () => {
    toast.success('Checklist enviado correctamente.');
    setDraftPhotos([]);
    setCreatedChecklistId(null);
    setEditingChecklistType(null);
    setScreenMode('detail');
    await loadDetailData();
  };

  // Cuando el checklist está creado y todas sus fotos subidas, cerramos el editor.
  const allPhotosUploaded =
    !!createdChecklistId && draftPhotos.length > 0 && draftPhotos.every((photo) => photo.status === 'done');

  useEffect(() => {
    if (!allPhotosUploaded || checklistSaving) {
      return;
    }

    toast.success('Checklist enviado correctamente.');
    setDraftPhotos([]);
    setCreatedChecklistId(null);
    setEditingChecklistType(null);
    setActionError(null);
    setScreenMode('detail');
  }, [allPhotosUploaded, checklistSaving]);

  const handleSaveChecklist = async () => {
    if (!selectedBooking || !editingChecklistType || !authUserId) {
      return;
    }

    if (!canCreateChecklistByRole(selectedBooking, authUserId)) {
      setActionError('Solo el conductor de la reserva puede enviar checklists.');
      return;
    }

    if (!canTransact) {
      setActionError('Necesitas el perfil verificado para gestionar checklists.');
      return;
    }

    const errors: typeof checklistErrors = validateChecklistDraft(checklistDraft);
    const pending = draftPhotos.filter((photo) => photo.status !== 'done');

    if (draftPhotos.length === 0) {
      errors.photos = 'Añade al menos una foto de evidencia.';
    } else if (draftPhotos.some((photo) => photo.status === 'processing')) {
      errors.photos = 'Espera a que terminen de optimizarse las fotos.';
    } else if (!createdChecklistId && draftPhotos.some((photo) => photo.status === 'error')) {
      errors.photos = 'Quita las fotos con error antes de enviar.';
    }

    setChecklistErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setChecklistSaving(true);
    setActionError(null);

    try {
      let checklistId = createdChecklistId;

      if (!checklistId) {
        const created = await httpClient.post<BookingChecklistItem>('/booking-checklists', {
          bookingId: selectedBooking.id,
          type: editingChecklistType,
          mileage: Number(checklistDraft.mileage.replace(/\./g, '').replace(',', '.')),
          fuelLevel: Number(checklistDraft.fuelLevel),
          notes: checklistDraft.notes.trim() || undefined
        });
        checklistId = created.data.id;
        setCreatedChecklistId(checklistId);
      }

      const results = await Promise.all(pending.map((photo) => uploadDraftPhoto(photo, checklistId as string)));
      const failed = results.filter((ok) => !ok).length;

      // Si todo sube bien, el efecto de "checklist completo" cierra el editor.
      if (failed > 0) {
        setActionError(
          `Checklist guardado, pero ${pluralize(failed, 'foto no se ha', 'fotos no se han')} podido subir. Reintenta o termina sin ellas.`
        );
      }
    } catch (saveError: unknown) {
      setActionError(getApiErrorMessage(saveError, 'No se pudo guardar el checklist.'));
    } finally {
      setChecklistSaving(false);
    }
  };

  /* --------------------------------- Reseña --------------------------------- */

  const handleCreateReview = async () => {
    if (!selectedBooking || !selectedBookingCounterpartId || !authUserId) {
      return;
    }

    if (!canTransact) {
      setReviewError('Necesitas el perfil verificado para publicar reseñas.');
      return;
    }

    if (selectedBooking.status !== 'completed') {
      setReviewError('Solo puedes valorar reservas completadas.');
      return;
    }

    if (reviewRatingInput < 1 || reviewRatingInput > 5) {
      setReviewError('Elige una puntuación de 1 a 5 estrellas.');
      return;
    }

    setReviewSaving(true);
    setReviewError(null);

    try {
      await httpClient.post('/reviews', {
        bookingId: selectedBooking.id,
        revieweeId: selectedBookingCounterpartId,
        rating: reviewRatingInput,
        comment: reviewCommentInput.trim() || undefined
      });

      toast.success('Reseña publicada. Puedes consultarla desde Perfil.');
      setReviewCommentInput('');
      setReviewRatingInput(0);
      setScreenMode('detail');
      await loadDetailData();
    } catch (saveError: unknown) {
      setReviewError(getApiErrorMessage(saveError, 'No se pudo publicar la reseña.'));
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
      displayName: getDisplayName(profileData?.firstName, profileData?.lastName),
      avatarUrl: profileData?.avatarUrl ?? null
    });
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

  const screenProps = { topPadding, bottomPadding, maxWidth: layoutTokens.formMaxWidth };

  /* ------------------------------------------------------------------------ */
  /* Editor de checklist                                                      */
  /* ------------------------------------------------------------------------ */

  if (screenMode === 'checklistEditor' && selectedBooking && editingChecklistType) {
    const alreadySent = checklists.some((item) => item.type === editingChecklistType) && !createdChecklistId;
    const photoItems: PhotoItem[] = draftPhotos.map((photo) => ({
      key: photo.key,
      uri: photo.previewUri,
      status: photo.status === 'ready' ? 'done' : photo.status,
      progress: photo.progress,
      errorMessage: photo.errorMessage
    }));
    const failedUploads = createdChecklistId ? draftPhotos.filter((photo) => photo.status === 'error').length : 0;

    return (
      <Screen
        {...screenProps}
        header={
          <ScreenHeader
            title={CHECKLIST_LABEL[editingChecklistType]}
            eyebrow={`Reserva #${getShortId(selectedBooking.id)}`}
            subtitle="Deja constancia del estado del coche con datos y fotos."
            onBack={() => void backToDetail()}
            backLabel="Volver a la reserva"
          />
        }
      >
        {alreadySent ? (
          <InlineMessage tone="info" message="Este checklist ya se envió y no puede modificarse." />
        ) : (
          <>
            <Card>
              <CardHeader title="Datos del vehículo" icon="speedometer-outline" />
              <TextField
                label="Kilometraje"
                required
                value={checklistDraft.mileage}
                onChangeText={(value) => {
                  setChecklistDraft((current) => ({ ...current, mileage: value.replace(/[^0-9]/g, '') }));
                  setChecklistErrors((current) => ({ ...current, mileage: undefined }));
                }}
                placeholder="Ej. 45210"
                keyboardType="number-pad"
                returnKeyType="next"
                right={<Text style={styles.unit}>km</Text>}
                error={checklistErrors.mileage}
                editable={!createdChecklistId}
              />
              <View style={styles.fuelBlock}>
                <TextField
                  label="Nivel de combustible / batería"
                  required
                  value={checklistDraft.fuelLevel}
                  onChangeText={(value) => {
                    setChecklistDraft((current) => ({ ...current, fuelLevel: value.replace(/[^0-9]/g, '').slice(0, 3) }));
                    setChecklistErrors((current) => ({ ...current, fuelLevel: undefined }));
                  }}
                  placeholder="0 - 100"
                  keyboardType="number-pad"
                  right={<Text style={styles.unit}>%</Text>}
                  error={checklistErrors.fuelLevel}
                  editable={!createdChecklistId}
                />
                <View style={styles.presetRow}>
                  {FUEL_PRESETS.map((preset) => {
                    const active = checklistDraft.fuelLevel === preset;
                    return (
                      <Button
                        key={preset}
                        label={`${preset}%`}
                        size="sm"
                        variant={active ? 'primary' : 'secondary'}
                        disabled={!!createdChecklistId}
                        onPress={() => {
                          setChecklistDraft((current) => ({ ...current, fuelLevel: preset }));
                          setChecklistErrors((current) => ({ ...current, fuelLevel: undefined }));
                        }}
                        style={styles.presetButton}
                      />
                    );
                  })}
                </View>
              </View>
              <TextField
                label="Observaciones"
                value={checklistDraft.notes}
                onChangeText={(value) => setChecklistDraft((current) => ({ ...current, notes: value }))}
                placeholder="Rayones, golpes, limpieza, objetos olvidados…"
                multiline
                maxLength={1000}
                editable={!createdChecklistId}
              />
            </Card>

            <Card>
              <CardHeader
                title="Fotos de evidencia"
                icon="camera-outline"
                subtitle={`${draftPhotos.length}/${MAX_CHECKLIST_PHOTOS} fotos · se guardan de forma privada`}
              />
              <InlineMessage
                tone="warning"
                title="Recomendación"
                message="Fotografía los 4 laterales, el cuadro con el kilometraje, el nivel de combustible, el interior y cualquier daño visible. Sin evidencias, la plataforma no podrá mediar en reclamaciones."
              />
              <PhotoGrid
                items={photoItems}
                onAdd={createdChecklistId ? undefined : (source) => void handleAddChecklistPhotos(source)}
                onRemove={(item) => void handleRemoveDraftPhoto(item)}
                onRetry={
                  createdChecklistId
                    ? (item) => {
                        const photo = draftPhotos.find((entry) => entry.key === item.key);
                        if (photo) {
                          void uploadDraftPhoto(photo, createdChecklistId);
                        }
                      }
                    : undefined
                }
                maxItems={MAX_CHECKLIST_PHOTOS}
                disabled={checklistSaving}
                addLabel="Añadir fotos"
              />
              {checklistErrors.photos ? <InlineMessage tone="error" message={checklistErrors.photos} /> : null}
            </Card>

            <VerificationGate
              missingProfile={!hasRequiredProfileData}
              missingVerification={!canTransact}
              onGoToProfile={goToProfile}
              action="enviar checklists"
            />
            {actionError ? <InlineMessage tone="error" message={actionError} /> : null}

            {failedUploads > 0 ? (
              <View style={styles.actions}>
                <Button
                  label="Reintentar fotos fallidas"
                  icon="refresh"
                  onPress={() => void handleSaveChecklist()}
                  loading={checklistSaving}
                  fullWidth
                />
                <Button label="Terminar sin esas fotos" variant="secondary" onPress={() => void finishChecklist()} fullWidth />
              </View>
            ) : (
              <Button
                label={createdChecklistId ? 'Reintentar subida' : 'Enviar checklist'}
                icon="checkmark-circle-outline"
                onPress={() => void handleSaveChecklist()}
                loading={checklistSaving}
                disabled={!canTransact}
                fullWidth
              />
            )}
          </>
        )}
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Reseña                                                                   */
  /* ------------------------------------------------------------------------ */

  if (screenMode === 'reviewComposer' && selectedBooking) {
    const counterpart = selectedBookingCounterpartId ? userById[selectedBookingCounterpartId] : undefined;
    const counterpartName = getDisplayName(counterpart?.firstName, counterpart?.lastName);

    return (
      <Screen
        {...screenProps}
        header={
          <ScreenHeader
            title="Valorar el viaje"
            eyebrow={`Reserva #${getShortId(selectedBooking.id)}`}
            subtitle="Tu reseña ayuda a la comunidad y será visible en el perfil."
            onBack={() => setScreenMode('detail')}
            backLabel="Volver a la reserva"
          />
        }
      >
        <Card>
          <View style={styles.reviewTarget}>
            <Avatar uri={resolveStoredImageUrl(counterpart?.avatarUrl ?? null)} name={counterpartName} size={56} />
            <Text style={styles.reviewTargetName}>{counterpartName}</Text>
            <Text style={styles.caption}>
              {selectedBookingIsOwnerView ? 'Conductor' : 'Propietario'} · {getVehicleLabel(vehicleById[selectedBooking.vehicleId])}
            </Text>
          </View>
          <StarRating value={reviewRatingInput} onChange={(value) => {
            setReviewRatingInput(value);
            setReviewError(null);
          }} size={36} />
          <TextField
            label="Comentario (opcional)"
            value={reviewCommentInput}
            onChangeText={setReviewCommentInput}
            placeholder="¿Qué tal fue la experiencia?"
            multiline
            maxLength={REVIEW_MAX_LENGTH}
            hint={`${reviewCommentInput.length}/${REVIEW_MAX_LENGTH}`}
          />
          {reviewError ? <InlineMessage tone="error" message={reviewError} /> : null}
          <VerificationGate
            missingProfile={!hasRequiredProfileData}
            missingVerification={!canTransact}
            onGoToProfile={goToProfile}
            action="publicar reseñas"
          />
          <Button
            label="Publicar reseña"
            icon="star-outline"
            onPress={() => void handleCreateReview()}
            loading={reviewSaving}
            disabled={!canTransact || reviewRatingInput === 0}
            fullWidth
          />
        </Card>
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Detalle                                                                  */
  /* ------------------------------------------------------------------------ */

  if (screenMode === 'detail' && selectedBooking) {
    const ownerProfile = userById[selectedBooking.ownerId];
    const driverProfile = userById[selectedBooking.driverId];
    const vehicle = vehicleById[selectedBooking.vehicleId];
    const status = selectedBooking.status;
    const isOwner = selectedBookingIsOwnerView;
    const isDriver = canCreateChecklistByRole(selectedBooking, authUserId);
    const myReview = reviews.find((review) => review.reviewerId === authUserId) ?? null;
    const days = getBillableDays(selectedBooking.startDatetime, selectedBooking.endDatetime);
    const busy = statusUpdating !== null;
    const isClosed = status === 'rejected' || status === 'cancelled';

    const actionButtons: Array<{ status: BookingStatus; label: string; variant?: 'primary' | 'accent' | 'dangerGhost' | 'secondary'; icon?: keyof typeof Ionicons.glyphMap; blockedReason?: string }> = [];
    // La API exige el checklist correspondiente antes de iniciar o completar el viaje.
    const hasChecklist = (type: BookingChecklistType) => checklists.some((item) => item.type === type);

    if (isOwner && status === 'pending') {
      actionButtons.push(
        { status: 'accepted', label: 'Aceptar solicitud', icon: 'checkmark' },
        { status: 'rejected', label: 'Rechazar', variant: 'dangerGhost', icon: 'close' },
        { status: 'cancelled', label: 'Cancelar', variant: 'secondary' }
      );
    }
    if (isOwner && status === 'accepted') {
      actionButtons.push({ status: 'cancelled', label: 'Cancelar reserva', variant: 'dangerGhost' });
    }
    if (isOwner && status === 'paid_confirmed') {
      actionButtons.push(
        {
          status: 'in_progress',
          label: 'Iniciar viaje',
          icon: 'key-outline',
          blockedReason: hasChecklist('check_in') ? undefined : 'Podrás iniciar el viaje cuando el conductor envíe el checklist de entrega.'
        },
        { status: 'cancelled', label: 'Cancelar reserva', variant: 'dangerGhost' }
      );
    }
    if (isOwner && status === 'in_progress') {
      actionButtons.push({
        status: 'completed',
        label: 'Marcar como completada',
        icon: 'flag-outline',
        blockedReason: hasChecklist('check_out')
          ? undefined
          : 'Podrás completarla cuando el conductor envíe el checklist de devolución.'
      });
    }
    if (!isOwner && status === 'pending') {
      actionButtons.push({ status: 'cancelled', label: 'Cancelar solicitud', variant: 'dangerGhost' });
    }
    if (!isOwner && status === 'accepted') {
      actionButtons.push({ status: 'paid_confirmed', label: `Pagar ${formatCurrencyEUR(selectedBooking.totalPrice)}`, variant: 'accent', icon: 'card-outline' });
      actionButtons.push({ status: 'cancelled', label: 'Cancelar reserva', variant: 'dangerGhost' });
    }
    if (!isOwner && status === 'paid_confirmed') {
      actionButtons.push({ status: 'cancelled', label: 'Cancelar reserva', variant: 'dangerGhost' });
    }

    const nextStepText: Partial<Record<BookingStatus, string>> = isOwner
      ? {
          pending: 'El conductor espera tu respuesta. Al aceptar compartirás tu método de contacto.',
          accepted: 'Esperando a que el conductor realice el pago.',
          paid_confirmed: 'Pago confirmado. Entrega las llaves e inicia el viaje.',
          in_progress: 'Viaje en curso. Márcalo como completado cuando recuperes el vehículo.'
        }
      : {
          pending: 'Tu solicitud está pendiente de respuesta del propietario.',
          accepted: '¡Aceptada! Realiza el pago para confirmar la reserva.',
          paid_confirmed: 'Reserva confirmada. Rellena el checklist de entrega al recoger el coche.',
          in_progress: 'Disfruta del viaje. Al devolver el coche rellena el checklist de devolución.'
        };

    return (
      <Screen
        {...screenProps}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        header={
          <ScreenHeader
            title={getVehicleLabel(vehicle)}
            eyebrow={`Reserva #${getShortId(selectedBooking.id)}`}
            onBack={backToList}
            backLabel="Mis viajes"
            right={<StatusChip label={BOOKING_STATUS_LABEL[status]} tone={BOOKING_STATUS_TONE[status]} dot />}
          />
        }
      >
        <VerificationGate
          missingProfile={!hasRequiredProfileData}
          missingVerification={!canTransact}
          onGoToProfile={goToProfile}
          action="gestionar reservas"
        />

        <Card>
          <Timeline status={status} />
          {nextStepText[status] ? <Text style={styles.nextStep}>{nextStepText[status]}</Text> : null}

          {actionButtons.length > 0 ? (
            <View style={styles.actions}>
              {isOwner && status === 'pending' ? (
                <TextField
                  label="Método de contacto para el conductor"
                  required
                  value={ownerContactMethodInput}
                  onChangeText={(value) => {
                    setOwnerContactMethodInput(value);
                    setContactError(null);
                  }}
                  placeholder="Ej. WhatsApp 600 123 123"
                  leftIcon="chatbubble-ellipses-outline"
                  error={contactError}
                  hint="Solo lo verá el conductor cuando aceptes."
                />
              ) : null}
              {actionButtons.map((action) =>
                !isOwner && action.status === 'paid_confirmed' ? (
                  <PaymentAction
                    key={action.status}
                    bookingId={selectedBooking.id}
                    disabled={busy || !canTransact}
                    renderButton={(buttonProps) => (
                      <Button
                        label={buttonProps.label === 'Pagar' ? action.label : buttonProps.label}
                        icon={action.icon}
                        variant={action.variant ?? 'primary'}
                        onPress={buttonProps.onPress}
                        loading={statusUpdating === action.status}
                        disabled={buttonProps.disabled}
                        fullWidth
                      />
                    )}
                    onDemoConfirm={() => void handleUpdateBookingStatus('paid_confirmed')}
                    onPaid={refreshAll}
                  />
                ) : (
                  <View key={action.status} style={styles.actionWithHint}>
                    <Button
                      label={action.label}
                      icon={action.icon}
                      variant={action.variant ?? 'primary'}
                      onPress={() => void handleUpdateBookingStatus(action.status)}
                      loading={statusUpdating === action.status}
                      disabled={busy || !canTransact || !!action.blockedReason}
                      fullWidth
                    />
                    {action.blockedReason ? <Text style={styles.caption}>{action.blockedReason}</Text> : null}
                  </View>
                )
              )}
              {['accepted', 'paid_confirmed'].includes(status) ? (
                <Text style={styles.caption}>Política de cancelación: {getCancellationNote(selectedBooking)}</Text>
              ) : null}
            </View>
          ) : isClosed ? (
            <Text style={styles.caption}>Esta reserva está cerrada y no admite más cambios.</Text>
          ) : null}

          {actionError ? <InlineMessage tone="error" message={actionError} /> : null}
        </Card>

        <Card>
          <CardHeader title="Resumen" icon="receipt-outline" />
          <View>
            <KeyValueRow label="Recogida" value={formatDateTimeMadrid(selectedBooking.startDatetime)} />
            <KeyValueRow label="Devolución" value={formatDateTimeMadrid(selectedBooking.endDatetime)} />
            <KeyValueRow label="Duración" value={pluralize(days, 'día', 'días')} />
            <KeyValueRow label="Precio por día" value={formatCurrencyEUR(selectedBooking.pricePerDayAtBooking)} />
            <KeyValueRow label="Comisión de servicio" value={formatCurrencyEUR(selectedBooking.platformFee)} />
            {isOwner ? <KeyValueRow label="Cobro al propietario" value={PAYOUT_STATUS_LABEL[selectedBooking.payoutStatus]} /> : null}
            <KeyValueRow label="Total" value={formatCurrencyEUR(selectedBooking.totalPrice)} emphasis last />
          </View>
          <Text style={styles.caption}>Solicitada el {formatDateTimeMadrid(selectedBooking.createdAt)}</Text>
        </Card>

        {selectedBooking.ownerContactMethod ? (
          <Card variant="muted">
            <CardHeader title="Contacto del propietario" icon="call-outline" />
            <Text style={styles.contactValue} selectable>
              {selectedBooking.ownerContactMethod}
            </Text>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Participantes" icon="people-outline" />
          {[
            { id: selectedBooking.ownerId, role: 'Propietario', data: ownerProfile },
            { id: selectedBooking.driverId, role: 'Conductor', data: driverProfile }
          ].map((person) => {
            const name = getDisplayName(person.data?.firstName, person.data?.lastName);
            const isMe = person.id === authUserId;
            return (
              <Card
                key={person.role}
                variant="outlined"
                padding={spacingTokens.md}
                onPress={isMe ? undefined : () => handleOpenUserOverview(person.id, person.data)}
                accessibilityLabel={`${person.role}: ${name}`}
              >
                <View style={styles.personRow}>
                  <Avatar uri={resolveStoredImageUrl(person.data?.avatarUrl ?? null)} name={name} size={40} />
                  <View style={styles.flex1}>
                    <Text style={styles.caption}>{person.role}</Text>
                    <Text style={styles.personName}>{isMe ? `${name} (tú)` : name}</Text>
                  </View>
                  {!isMe ? <Ionicons name="chevron-forward" size={18} color={colorTokens.textMuted} /> : null}
                </View>
              </Card>
            );
          })}
        </Card>

        <Card>
          <CardHeader title="Checklists" icon="clipboard-outline" subtitle="Estado del coche en la entrega y la devolución" />
          {detailLoading && checklists.length === 0 ? (
            <View style={styles.skeletons}>
              <Skeleton height={56} radius={radiusTokens.input} />
              <Skeleton height={56} radius={radiusTokens.input} />
            </View>
          ) : (
            (['check_in', 'check_out'] as BookingChecklistType[]).map((type) => {
              const checklist = checklists.find((item) => item.type === type) ?? null;
              const available = canOpenChecklist(type, status);
              const imageCount = checklist ? checklistImageCount[checklist.id] : undefined;

              return (
                <View key={type} style={styles.checklistRow}>
                  <View style={styles.checklistHead}>
                    <Text style={styles.checklistTitle}>{CHECKLIST_LABEL[type]}</Text>
                    <StatusChip
                      compact
                      label={checklist ? 'Enviado' : available ? 'Pendiente' : 'Bloqueado'}
                      tone={checklist ? 'success' : available ? 'warning' : 'neutral'}
                      icon={checklist ? 'checkmark' : available ? 'time-outline' : 'lock-closed-outline'}
                    />
                  </View>
                  {checklist ? (
                    <View style={styles.checklistData}>
                      <Text style={styles.bodyText}>
                        {checklist.mileage.toLocaleString('es-ES')} km · Combustible {checklist.fuelLevel}%
                      </Text>
                      {checklist.notes ? <Text style={styles.caption}>“{checklist.notes}”</Text> : null}
                      <Text style={styles.caption}>
                        Enviado el {formatDateTimeMadrid(checklist.createdAt)}
                        {typeof imageCount === 'number' ? ` · ${pluralize(imageCount, 'foto', 'fotos')} privadas` : ''}
                      </Text>
                    </View>
                  ) : !available ? (
                    <Text style={styles.caption}>{getChecklistBlockReason(type, status)}</Text>
                  ) : isDriver ? (
                    <Button
                      label={`Rellenar ${type === 'check_in' ? 'entrega' : 'devolución'}`}
                      icon="create-outline"
                      size="sm"
                      onPress={() => openChecklistEditor(type)}
                      disabled={!canTransact}
                      style={styles.alignStart}
                    />
                  ) : (
                    <Text style={styles.caption}>Lo rellena el conductor al {type === 'check_in' ? 'recoger' : 'devolver'} el coche.</Text>
                  )}
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <CardHeader title="Reseña" icon="star-outline" />
          {status !== 'completed' ? (
            <Text style={styles.caption}>Podrás valorar a la otra parte cuando la reserva esté completada.</Text>
          ) : myReview ? (
            <View style={styles.reviewDone}>
              <StarRating value={myReview.rating} size={18} />
              <Text style={styles.caption}>Ya has enviado tu reseña. Puedes consultarla en Perfil.</Text>
            </View>
          ) : (
            <Button
              label="Escribir reseña"
              icon="create-outline"
              onPress={() => {
                setReviewError(null);
                setScreenMode('reviewComposer');
              }}
              disabled={!canTransact}
              style={styles.alignStart}
            />
          )}
        </Card>

        {detailError ? (
          <InlineMessage tone="error" message={detailError} actionLabel="Reintentar" onAction={() => void loadDetailData()} />
        ) : null}

        {overviewModal}
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Lista                                                                    */
  /* ------------------------------------------------------------------------ */

  const renderBookingCard = (booking: BookingItem) => {
    const vehicle = vehicleById[booking.vehicleId];
    const counterpartId = roleView === 'driver' ? booking.ownerId : booking.driverId;
    const counterpart = userById[counterpartId];
    const counterpartName = getDisplayName(counterpart?.firstName, counterpart?.lastName);
    const needsAction =
      (roleView === 'owner' && booking.status === 'pending') || (roleView === 'driver' && booking.status === 'accepted');

    return (
      <Card
        key={booking.id}
        onPress={() => openBookingDetail(booking.id)}
        accessibilityLabel={`${getVehicleLabel(vehicle)}, ${BOOKING_STATUS_LABEL[booking.status]}`}
        accessibilityHint="Abre el detalle de la reserva"
      >
        <View style={styles.bookingHead}>
          <View style={styles.flex1}>
            <Text style={styles.bookingTitle} numberOfLines={1}>
              {getVehicleLabel(vehicle)}
            </Text>
            <Text style={styles.caption}>Reserva #{getShortId(booking.id)}</Text>
          </View>
          <StatusChip label={BOOKING_STATUS_LABEL[booking.status]} tone={BOOKING_STATUS_TONE[booking.status]} compact dot />
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={16} color={colorTokens.textMuted} />
          <Text style={styles.metaText}>{formatDateRangeMadrid(booking.startDatetime, booking.endDatetime)}</Text>
        </View>
        <View style={styles.bookingFoot}>
          <View style={styles.counterpart}>
            <Avatar uri={resolveStoredImageUrl(counterpart?.avatarUrl ?? null)} name={counterpartName} size={28} />
            <Text style={styles.counterpartName} numberOfLines={1}>
              {counterpartName}
            </Text>
          </View>
          <Text style={styles.bookingPrice}>{formatCurrencyEUR(booking.totalPrice)}</Text>
        </View>
        {needsAction ? (
          <View style={styles.actionHint}>
            <Ionicons name="alert-circle" size={16} color={colorTokens.accent2} />
            <Text style={styles.actionHintText}>
              {roleView === 'owner' ? 'Responde a la solicitud' : 'Pendiente de pago'} ·{' '}
              {formatRelativeFromNow(booking.startDatetime)}
            </Text>
          </View>
        ) : null}
      </Card>
    );
  };

  const showSkeletons = loading && !loaded;

  return (
    <Screen
      {...screenProps}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      header={<ScreenHeader title="Mis viajes" subtitle="Tus reservas como conductor y como propietario." />}
      stickyHeader={
        <SegmentedControl
          options={[
            { value: 'driver', label: 'Conductor', icon: 'car-outline', badge: driverPendingCount || undefined },
            { value: 'owner', label: 'Propietario', icon: 'key-outline', badge: ownerPendingCount || undefined }
          ]}
          value={roleView}
          onChange={(value) => {
            roleViewChosenRef.current = true;
            setRoleView(value);
          }}
        />
      }
    >
      {showSkeletons ? (
        <>
          <Skeleton height={84} radius={radiusTokens.card} />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </>
      ) : error && allBookings.length === 0 ? (
        <ErrorState message={error} onRetry={() => void loadBookings()} retrying={loading} />
      ) : (
        <>
          {error ? (
            <InlineMessage tone="error" message={error} actionLabel="Reintentar" onAction={() => void loadBookings()} />
          ) : null}

          {activeBookings.length > 0 ? (
            <View style={styles.stats}>
              <StatTile label="Activas" value={String(bookingSummary.active)} />
              <StatTile label="Completadas" value={String(bookingSummary.completed)} />
              <StatTile
                label={roleView === 'owner' ? 'Ingresos' : 'Gastado'}
                value={formatCurrencyEUR(bookingSummary.totalAmount)}
              />
            </View>
          ) : null}

          {upcomingBookings.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Próximas y en curso" count={upcomingBookings.length} />
              {upcomingBookings.map(renderBookingCard)}
            </View>
          ) : null}

          {pastBookings.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Historial" count={pastBookings.length} />
              {pastBookings.map(renderBookingCard)}
            </View>
          ) : null}

          {activeBookings.length === 0 && !error ? (
            roleView === 'driver' ? (
              <EmptyState
                icon="car-outline"
                title="Aún no has reservado"
                description="Encuentra un coche cerca de ti y envía tu primera solicitud."
                actionLabel={onNavigateToTab ? 'Explorar vehículos' : undefined}
                onAction={onNavigateToTab ? () => onNavigateToTab('explore') : undefined}
              />
            ) : (
              <EmptyState
                icon="key-outline"
                title="Sin solicitudes recibidas"
                description="Cuando alguien quiera alquilar tu coche, la solicitud aparecerá aquí."
                actionLabel={onNavigateToTab ? 'Gestionar mis vehículos' : undefined}
                onAction={onNavigateToTab ? () => onNavigateToTab('myVehicles') : undefined}
              />
            )
          ) : null}
        </>
      )}

      {overviewModal}
    </Screen>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

/** Línea de tiempo del estado de la reserva (flujo feliz o cierre). */
// Etiquetas cortas para que quepan en una línea en móviles estrechos.
const TIMELINE_STEP_LABEL: Partial<Record<BookingStatus, string>> = {
  paid_confirmed: 'Pagada'
};

function Timeline({ status }: { status: BookingStatus }) {
  if (status === 'rejected' || status === 'cancelled') {
    return (
      <View style={styles.closedBanner}>
        <Ionicons name={status === 'rejected' ? 'close-circle' : 'ban-outline'} size={20} color={colorTokens.alertText} />
        <Text style={styles.closedText}>
          {status === 'rejected' ? 'El propietario rechazó la solicitud.' : 'La reserva fue cancelada.'}
        </Text>
      </View>
    );
  }

  const currentIndex = BOOKING_TIMELINE.indexOf(status);

  return (
    <View style={styles.timeline} accessibilityLabel={`Estado: ${BOOKING_STATUS_LABEL[status]}`}>
      {BOOKING_TIMELINE.map((step, index) => {
        const done = index < currentIndex || status === 'completed';
        const current = index === currentIndex && status !== 'completed';

        return (
          <View key={step} style={styles.timelineStep}>
            <View style={styles.timelineTrack}>
              <View style={[styles.timelineLine, index === 0 ? styles.hidden : null, index <= currentIndex ? styles.timelineLineDone : null]} />
              <View style={[styles.timelineDot, done ? styles.timelineDotDone : null, current ? styles.timelineDotCurrent : null]}>
                {done ? <Ionicons name="checkmark" size={12} color={colorTokens.white} /> : null}
              </View>
              <View
                style={[
                  styles.timelineLine,
                  index === BOOKING_TIMELINE.length - 1 ? styles.hidden : null,
                  index < currentIndex ? styles.timelineLineDone : null
                ]}
              />
            </View>
            <Text style={[styles.timelineLabel, current ? styles.timelineLabelCurrent : null]} numberOfLines={1}>
              {TIMELINE_STEP_LABEL[step] ?? BOOKING_STATUS_LABEL[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  alignStart: {
    alignSelf: 'flex-start'
  },
  hidden: {
    opacity: 0
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  bodyText: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  unit: {
    color: colorTokens.textMuted,
    ...typographyTokens.bodyStrong
  },
  section: {
    gap: spacingTokens.md
  },
  stats: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  statTile: {
    flex: 1,
    gap: 2,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.card,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white
  },
  statValue: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  bookingHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingTokens.sm
  },
  bookingTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.xs
  },
  metaText: {
    flex: 1,
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontSize: 14
  },
  bookingFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.sm
  },
  counterpart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  counterpartName: {
    flex: 1,
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  bookingPrice: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  actionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.xs,
    paddingTop: spacingTokens.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colorTokens.border
  },
  actionHintText: {
    color: colorTokens.accent2Pressed,
    ...typographyTokens.captionStrong
  },
  nextStep: {
    color: colorTokens.secondary,
    ...typographyTokens.body
  },
  actions: {
    gap: spacingTokens.sm
  },
  contactValue: {
    color: colorTokens.primary,
    ...typographyTokens.bodyL
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  personName: {
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  skeletons: {
    gap: spacingTokens.sm
  },
  checklistRow: {
    gap: spacingTokens.sm,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  checklistHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.sm
  },
  checklistTitle: {
    flex: 1,
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  checklistData: {
    gap: 2
  },
  reviewDone: {
    gap: spacingTokens.xs
  },
  reviewTarget: {
    alignItems: 'center',
    gap: spacingTokens.xs
  },
  reviewTargetName: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  fuelBlock: {
    gap: spacingTokens.sm
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacingTokens.xs
  },
  presetButton: {
    flex: 1,
    paddingHorizontal: 0
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.alertSoft
  },
  closedText: {
    flex: 1,
    color: colorTokens.alertText,
    ...typographyTokens.bodyStrong
  },
  timeline: {
    flexDirection: 'row'
  },
  actionWithHint: {
    gap: spacingTokens.xs
  },
  timelineStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6
  },
  timelineTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch'
  },
  timelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: colorTokens.border
  },
  timelineLineDone: {
    backgroundColor: colorTokens.success
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colorTokens.borderStrong,
    backgroundColor: colorTokens.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timelineDotDone: {
    borderColor: colorTokens.success,
    backgroundColor: colorTokens.success
  },
  timelineDotCurrent: {
    borderColor: colorTokens.accent2,
    borderWidth: 6
  },
  timelineLabel: {
    // Ancho fijo centrado mayor que la columna para que "Completada" quepa en una línea.
    width: 84,
    minWidth: 84,
    flexShrink: 0,
    alignSelf: 'center',
    textAlign: 'center',
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontSize: 11,
    lineHeight: 14
  },
  timelineLabelCurrent: {
    color: colorTokens.primary,
    ...typographyTokens.captionStrong,
    fontSize: 11,
    lineHeight: 14
  }
});
