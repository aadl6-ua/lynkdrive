import { FuelType, Transmission, VehicleStatus } from './create-vehicle.dto';
import type { VehicleSearchFilters } from '@lynkdrive/shared';

export class GetVehiclesFiltersDto implements VehicleSearchFilters {
  maxPrice?: number;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  status?: VehicleStatus;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}
