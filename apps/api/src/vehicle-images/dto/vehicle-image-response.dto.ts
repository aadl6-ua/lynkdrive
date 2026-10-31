import type { VehicleImageResponse } from '@lynkdrive/shared';

export class VehicleImageResponseDto implements VehicleImageResponse<Date> {
  id!: string;
  vehicleId!: string;
  imageUrl!: string;
  isPrimary!: boolean;
  createdAt!: Date;
}
