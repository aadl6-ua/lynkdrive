import { FuelType, Transmission } from './create-vehicle.dto';
import type { VehicleSearchFilters } from '@lynkdrive/shared';

export class GetVehiclesFiltersDto implements VehicleSearchFilters {
  maxPrice?: number;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  from?: string;
  to?: string;
}
