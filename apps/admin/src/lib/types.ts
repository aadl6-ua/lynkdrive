// Contratos de /api/admin (ver apps/api/src/admin/admin.service.ts).

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type PersonRef = { id: string; firstName: string; lastName: string };

export type SignedFile = { url: string | null; expiresAt: string | null };

export type Dashboard = {
  users: { total: number; verified: number; pendingVerification: number; blocked: number; newLast30Days: number };
  vehicles: { total: number; active: number; inactive: number };
  bookings: { total: number; byStatus: Partial<Record<BookingStatus, number>> };
  revenue: {
    currency: string;
    gross: number;
    grossLast30Days: number;
    platformFeePercent: number;
    estimatedPlatformFees: number;
    paidBookings: number;
    monthly: Array<{ month: string; gross: number; bookings: number }>;
  };
  moderation: { openIncidents: number; hiddenReviews: number };
};

export type AdminUser = {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  hasIdDocument: boolean;
  hasDriverLicense: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  hasStripeAccount: boolean;
  createdAt: string;
  deletedAt: string | null;
};

export type AdminUserDetail = AdminUser & {
  avatar: SignedFile;
  documents: { idDocument: SignedFile; driverLicense: SignedFile };
  stats: {
    vehicles: number;
    bookingsAsDriver: number;
    bookingsAsOwner: number;
    reviewsReceived: number;
    averageRating: number | null;
    incidents: number;
  };
};

export type AdminVehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  pricePerDay: number;
  locationAddress: string;
  status: 'active' | 'inactive';
  disabledByAdmin: boolean;
  primaryImageUrl: string | null;
  bookings: number;
  createdAt: string;
  owner: PersonRef;
};

export type AdminReview = {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  reviewer: PersonRef;
  reviewee: PersonRef;
};

export type AdminBooking = {
  id: string;
  status: BookingStatus;
  startDatetime: string;
  endDatetime: string;
  pricePerDayAtBooking: number;
  platformFee: number;
  totalPrice: number;
  paymentIntentId: string | null;
  payoutStatus: string;
  createdAt: string;
  updatedAt: string;
  vehicle: { id: string; brand: string; model: string; licensePlate: string };
  driver: PersonRef;
  owner: PersonRef;
};

export type AdminBookingDetail = AdminBooking & {
  ownerContactMethod: string | null;
  history: Array<{ fromStatus: BookingStatus | null; toStatus: BookingStatus; changedAt: string }>;
  checklists: Array<{
    id: string;
    type: 'check_in' | 'check_out';
    mileage: number;
    fuelLevel: number;
    notes: string | null;
    createdAt: string;
    submittedBy: PersonRef;
    images: Array<{ id: string; checklistId: string; createdAt: string; file: SignedFile }>;
  }>;
  reviewIds: string[];
  incidents: Array<{ id: string; title: string; status: IncidentStatus; createdAt: string }>;
};

export type AdminIncident = {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  bookingId: string | null;
  userId: string | null;
  vehicleId: string | null;
  createdBy: string | null;
  notesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminIncidentDetail = AdminIncident & {
  notes: Array<{ id: string; body: string; createdAt: string; author: PersonRef | null }>;
};
