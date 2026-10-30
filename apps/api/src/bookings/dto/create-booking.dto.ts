import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(64)
  startDatetime!: string;

  @IsString()
  @MaxLength(64)
  endDatetime!: string;
}
