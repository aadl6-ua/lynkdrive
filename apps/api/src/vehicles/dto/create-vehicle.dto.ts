export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type Transmission = 'manual' | 'automatic';
export type VehicleStatus = 'active' | 'inactive';

export class CreateVehicleDto {
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
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  status?: VehicleStatus;
}
