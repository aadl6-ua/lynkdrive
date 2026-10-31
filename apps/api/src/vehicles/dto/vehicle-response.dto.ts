import { FuelType, Transmission, VehicleStatus } from './create-vehicle.dto';
import type { VehicleResponse } from '@lynkdrive/shared';

export class VehicleResponseDto implements VehicleResponse<Date> {
  id!: string;
  ownerId!: string;
  brand!: string;
  model!: string;
  year!: number;
  licensePlate!: string;
  description!: string;
  pricePerDay!: number;
  locationLat!: number;
  locationLng!: number;
  locationAddress!: string;
  fuelType!: FuelType | null;
  transmission!: Transmission | null;
  seats!: number | null;
  status!: VehicleStatus;
  createdAt!: Date;
}
