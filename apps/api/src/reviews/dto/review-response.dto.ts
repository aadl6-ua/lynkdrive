export class ReviewResponseDto {
  id!: string;
  bookingId!: string;
  reviewerId!: string;
  revieweeId!: string;
  rating!: number;
  comment!: string | null;
  createdAt!: Date;
}
