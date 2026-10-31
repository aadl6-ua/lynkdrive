import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { BookingStatus, UpdateBookingStatusRequest } from '@lynkdrive/shared';

export type { BookingStatus };

export const BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'paid_confirmed',
  'in_progress',
  'completed',
  'cancelled'
];

export class UpdateBookingStatusDto implements UpdateBookingStatusRequest {
  @IsIn(BOOKING_STATUSES)
  status!: BookingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ownerContactMethod?: string;
}
