export class UserOverviewResponseDto {
  userId!: string;
  completedTripsAsDriver!: number;
  completedTripsAsOwner!: number;
  averageRating!: number | null;
  ratingsCount!: number;
}
