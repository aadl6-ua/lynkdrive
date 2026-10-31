import { ChecklistType } from './create-booking-checklist.dto';
import type { BookingChecklistResponse } from '@lynkdrive/shared';

export class BookingChecklistResponseDto implements BookingChecklistResponse<Date> {
  id!: string;
  bookingId!: string;
  type!: ChecklistType;
  submittedBy!: string;
  mileage!: number;
  fuelLevel!: number;
  notes!: string | null;
  createdAt!: Date;
}
