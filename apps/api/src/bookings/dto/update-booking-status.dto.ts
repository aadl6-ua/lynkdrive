export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export class UpdateBookingStatusDto {
  status!: BookingStatus;
  ownerContactMethod?: string;
}
