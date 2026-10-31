import type { ReviewResponse } from '@lynkdrive/shared';

export class ReviewResponseDto implements ReviewResponse<Date> {
  id!: string;
  bookingId!: string;
  reviewerId!: string;
  revieweeId!: string;
  rating!: number;
  comment!: string | null;
  createdAt!: Date;
}
