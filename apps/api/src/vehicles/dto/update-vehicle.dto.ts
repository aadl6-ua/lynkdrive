import { FuelType, Transmission, VehicleStatus } from './create-vehicle.dto';

export class UpdateVehicleDto {
  ownerId?: string;
  brand?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  description?: string;
  pricePerDay?: number;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  status?: VehicleStatus;
}
