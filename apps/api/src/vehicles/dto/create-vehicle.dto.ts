import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from 'class-validator';

export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type Transmission = 'manual' | 'automatic';
export type VehicleStatus = 'active' | 'inactive';

export const FUEL_TYPES: FuelType[] = ['gasoline', 'diesel', 'electric', 'hybrid'];
export const TRANSMISSIONS: Transmission[] = ['manual', 'automatic'];
export const VEHICLE_STATUSES: VehicleStatus[] = ['active', 'inactive'];

export class CreateVehicleDto {
  // Se ignora en el endpoint: el propietario siempre es el usuario autenticado.
  @IsOptional()
  @IsUUID()
  ownerId!: string;

  @IsString()
  @MaxLength(100)
  brand!: string;

  @IsString()
  @MaxLength(100)
  model!: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsString()
  @MaxLength(20)
  licensePlate!: string;

  @IsString()
  @MaxLength(5000)
  description!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  pricePerDay!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  locationLat!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  locationLng!: number;

  @IsString()
  @MaxLength(255)
  locationAddress!: string;

  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: FuelType;

  @IsOptional()
  @IsIn(TRANSMISSIONS)
  transmission?: Transmission;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  seats?: number;

  @IsOptional()
  @IsIn(VEHICLE_STATUSES)
  status?: VehicleStatus;
}
