import { FuelType, Transmission, VehicleStatus } from './create-vehicle.dto';

export class GetVehiclesFiltersDto {
  maxPrice?: number;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  status?: VehicleStatus;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}
