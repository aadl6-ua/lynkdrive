export class CreateReviewDto {
  bookingId!: string;
  revieweeId!: string;
  rating!: number;
  comment?: string;
}
