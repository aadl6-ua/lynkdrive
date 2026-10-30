import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'paid_confirmed',
  'in_progress',
  'completed',
  'cancelled'
];

export class UpdateBookingStatusDto {
  @IsIn(BOOKING_STATUSES)
  status!: BookingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ownerContactMethod?: string;
}
