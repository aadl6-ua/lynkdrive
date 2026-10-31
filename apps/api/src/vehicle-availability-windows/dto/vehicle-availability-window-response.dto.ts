import type { VehicleAvailabilityWindowResponse } from '@lynkdrive/shared';

export class VehicleAvailabilityWindowResponseDto implements VehicleAvailabilityWindowResponse<Date> {
  id!: string;
  vehicleId!: string;
  startDatetime!: Date;
  endDatetime!: Date;
  createdAt!: Date;
}
