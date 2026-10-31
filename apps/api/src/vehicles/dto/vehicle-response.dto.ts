import { FuelType, Transmission, VehicleStatus } from './create-vehicle.dto';

export class VehicleResponseDto {
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

/** Vista pública (Explorar, ficha): sin la matrícula, que solo ve el propietario. */
export type PublicVehicleResponseDto = Omit<VehicleResponseDto, 'licensePlate'>;
