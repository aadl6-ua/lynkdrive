export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type Transmission = 'manual' | 'automatic';

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid_confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface CreateVehicleDto {
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  description: string;
  pricePerDay: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  fuelType?: FuelType;
  transmission?: Transmission;
  seats?: number;
}
