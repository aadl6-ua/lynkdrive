import type { IsoDateString } from './common';

/** Respuesta de `/reviews`. */
export interface ReviewResponse<TDate = IsoDateString> {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  /** Entero entre 1 y 5. */
  rating: number;
  comment: string | null;
  createdAt: TDate;
}

/** Cuerpo de `POST /reviews` (el autor se toma del JWT). */
export interface CreateReviewRequest {
  bookingId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewRequest {
  rating?: number;
  comment?: string | null;
}
