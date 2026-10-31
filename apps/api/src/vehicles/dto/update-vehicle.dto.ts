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
import {
  FUEL_TYPES,
  MAX_PRICE_PER_DAY,
  FuelType,
  Transmission,
  TRANSMISSIONS,
  VEHICLE_STATUSES,
  VehicleStatus
} from './create-vehicle.dto';

export class UpdateVehicleDto {
  // Se ignora en el endpoint: el propietario no puede transferirse.
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(MAX_PRICE_PER_DAY)
  pricePerDay?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  locationAddress?: string;

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
