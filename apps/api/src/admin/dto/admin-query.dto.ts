import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BOOKING_STATUSES, BookingStatus } from 'src/bookings/dto/update-booking-status.dto';
import { INCIDENT_STATUSES, IncidentStatus } from './incident.dto';

export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = 20;
}

export const USER_FILTERS = ['all', 'pending_verification', 'verified', 'blocked', 'admins'] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

export class AdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(USER_FILTERS)
  filter?: UserFilter;
}

export class AdminVehiclesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class AdminReviewsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['all', 'visible', 'hidden'])
  visibility?: 'all' | 'visible' | 'hidden';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  maxRating?: number;
}

export class AdminBookingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;
}

export class AdminIncidentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(INCIDENT_STATUSES)
  status?: IncidentStatus;
}
