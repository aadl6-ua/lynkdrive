import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export const INCIDENT_STATUSES: IncidentStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export class CreateIncidentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}

export class UpdateIncidentStatusDto {
  @IsIn(INCIDENT_STATUSES)
  status!: IncidentStatus;
}

export class CreateIncidentNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
