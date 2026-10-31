import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from 'class-validator';

/** Tope razonable por día; además evita desbordar NUMERIC(10,2). */
export const MAX_PRICE_PER_DAY = 10000;

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
  @IsNotEmpty()
  @MaxLength(100)
  brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  licensePlate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(MAX_PRICE_PER_DAY)
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
  @IsNotEmpty()
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
