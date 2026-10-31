import { FuelType, Transmission } from './create-vehicle.dto';

export class GetVehiclesFiltersDto {
  maxPrice?: number;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}
