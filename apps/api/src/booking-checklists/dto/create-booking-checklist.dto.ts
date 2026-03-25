export type ChecklistType = 'check_in' | 'check_out';

export class CreateBookingChecklistDto {
  bookingId!: string;
  type!: ChecklistType;
  mileage!: number;
  fuelLevel!: number;
  notes?: string;
}
