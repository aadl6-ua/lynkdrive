import type { IsoDateString } from './common';

export type ChecklistType = 'check_in' | 'check_out';

export const CHECKLIST_TYPES: readonly ChecklistType[] = ['check_in', 'check_out'];

/** Respuesta de `/booking-checklists`. */
export interface BookingChecklistResponse<TDate = IsoDateString> {
  id: string;
  bookingId: string;
  type: ChecklistType;
  submittedBy: string;
  mileage: number;
  /** Porcentaje de combustible/batería entre 0 y 100. */
  fuelLevel: number;
  notes: string | null;
  createdAt: TDate;
}

export interface CreateBookingChecklistRequest {
  bookingId: string;
  type: ChecklistType;
  mileage: number;
  fuelLevel: number;
  notes?: string;
}

export interface UpdateBookingChecklistRequest {
  mileage?: number;
  fuelLevel?: number;
  notes?: string | null;
}

/** Respuesta de `/checklist-images`. */
export interface ChecklistImageResponse<TDate = IsoDateString> {
  id: string;
  checklistId: string;
  imageUrl: string;
  createdAt: TDate;
}

export interface CreateChecklistImageRequest {
  checklistId: string;
  imageUrl: string;
}
