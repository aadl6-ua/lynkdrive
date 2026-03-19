import { ChecklistType } from './create-booking-checklist.dto';

export class BookingChecklistResponseDto {
  id!: string;
  bookingId!: string;
  type!: ChecklistType;
  submittedBy!: string;
  mileage!: number;
  fuelLevel!: number;
  notes!: string | null;
  createdAt!: Date;
}
