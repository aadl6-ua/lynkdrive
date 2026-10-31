import type { IsoDateString } from './common';

export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type Transmission = 'manual' | 'automatic';
export type VehicleStatus = 'active' | 'inactive';

export const FUEL_TYPES: readonly FuelType[] = ['gasoline', 'diesel', 'electric', 'hybrid'];
export const TRANSMISSIONS: readonly Transmission[] = ['manual', 'automatic'];
export const VEHICLE_STATUSES: readonly VehicleStatus[] = ['active', 'inactive'];

/** Respuesta de `GET /vehicles`, `GET /vehicles/:id`, `GET /vehicles/mine/list` y mutaciones. */
export interface VehicleResponse<TDate = IsoDateString> {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  description: string;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType: FuelType | null;
  transmission: Transmission | null;
  seats: number | null;
  status: VehicleStatus;
  createdAt: TDate;
}

/** Cuerpo de `POST /vehicles` (el propietario se toma del JWT). */
export interface CreateVehicleRequest {
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  description: string;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType?: FuelType | null;
  transmission?: Transmission | null;
  seats?: number | null;
  status?: VehicleStatus;
}

/** Cuerpo de `PUT /vehicles/:id`. */
export type UpdateVehicleRequest = Partial<CreateVehicleRequest>;

/** Query de `GET /vehicles` (búsqueda geoespacial y filtros). */
export interface VehicleSearchFilters {
  maxPrice?: number;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
  status?: VehicleStatus;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

/** Respuesta de `/vehicle-images`. */
export interface VehicleImageResponse<TDate = IsoDateString> {
  id: string;
  vehicleId: string;
  imageUrl: string;
  isPrimary: boolean;
  createdAt: TDate;
}

export interface CreateVehicleImageRequest {
  vehicleId: string;
  imageUrl: string;
  isPrimary?: boolean;
}

export interface UpdateVehicleImageRequest {
  imageUrl?: string;
  isPrimary?: boolean;
}

/** Respuesta de `/vehicle-availability-windows`. */
export interface VehicleAvailabilityWindowResponse<TDate = IsoDateString> {
  id: string;
  vehicleId: string;
  startDatetime: TDate;
  endDatetime: TDate;
  createdAt: TDate;
}

export interface CreateVehicleAvailabilityWindowRequest {
  vehicleId: string;
  startDatetime: IsoDateString;
  endDatetime: IsoDateString;
}

export interface UpdateVehicleAvailabilityWindowRequest {
  startDatetime?: IsoDateString;
  endDatetime?: IsoDateString;
}
