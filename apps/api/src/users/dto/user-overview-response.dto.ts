import type { UserOverviewResponse } from '@lynkdrive/shared';

export class UserOverviewResponseDto implements UserOverviewResponse {
  userId!: string;
  completedTripsAsDriver!: number;
  completedTripsAsOwner!: number;
  averageRating!: number | null;
  ratingsCount!: number;
}
