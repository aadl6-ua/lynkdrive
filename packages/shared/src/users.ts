import type { IsoDateString } from './common';

/** Perfil completo: `GET/PUT /users/me`. */
export interface UserResponse<TDate = IsoDateString> {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  idDocumentUrl: string | null;
  driverLicenseUrl: string | null;
  isVerified: boolean;
  createdAt: TDate;
}

/** Perfil público de otro usuario (sin datos de contacto ni documentos). */
export interface PublicUserResponse<TDate = IsoDateString> {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: TDate;
}

/** Resumen de actividad y reputación de un usuario. */
export interface UserOverviewResponse {
  userId: string;
  completedTripsAsDriver: number;
  completedTripsAsOwner: number;
  averageRating: number | null;
  ratingsCount: number;
}

/** Cuerpo de `PUT /users/me`. */
export interface UpdateMyProfileRequest {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  idDocumentUrl?: string | null;
  driverLicenseUrl?: string | null;
}
