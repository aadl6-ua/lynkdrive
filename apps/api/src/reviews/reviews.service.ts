import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewEntity } from './entities/review.entity';

type BookingAccessRow = {
  booking_id: string;
  owner_id: string;
  driver_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
};

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ReviewEntity)
    private readonly reviewsRepository: Repository<ReviewEntity>
  ) {}

  async findAllForUser(userId: string, bookingId?: string): Promise<ReviewResponseDto[]> {
    if (bookingId) {
      await this.ensureBookingParticipant(bookingId, userId);
    }

    // Las reseñas ocultas por moderación solo las sigue viendo su autor (evita que la app
    // le ofrezca reseñar de nuevo y choque con la unicidad).
    const scope = bookingId ? { bookingId } : {};
    const where = [
      { ...scope, hiddenAt: IsNull() },
      { ...scope, reviewerId: userId }
    ];
    const reviews = await this.reviewsRepository.find({
      where,
      order: { createdAt: 'DESC' }
    });

    const visible = bookingId
      ? reviews
      : await this.filterReviewsByParticipation(reviews, userId);

    return visible.map((item) => this.toResponseDto(item));
  }

  async findByIdForUser(id: string, userId: string): Promise<ReviewResponseDto> {
    const review = await this.reviewsRepository.findOne({ where: { id } });

    if (!review) {
      throw new NotFoundException(`Review ${id} not found`);
    }

    await this.ensureBookingParticipant(review.bookingId, userId);
    return this.toResponseDto(review);
  }

  async createForUser(userId: string, createReviewDto: CreateReviewDto): Promise<ReviewResponseDto> {
    const booking = await this.ensureBookingParticipant(createReviewDto.bookingId, userId);

    if (booking.status !== 'completed') {
      throw new BadRequestException('Review can be created only when booking is completed');
    }

    if (createReviewDto.revieweeId === userId) {
      throw new BadRequestException('revieweeId must be a different user');
    }

    const allowedReviewee = booking.owner_id === userId ? booking.driver_id : booking.owner_id;

    if (createReviewDto.revieweeId !== allowedReviewee) {
      throw new ForbiddenException('revieweeId must be the other participant of this booking');
    }

    this.validateRating(createReviewDto.rating);

    const toSave = this.reviewsRepository.create({
      bookingId: createReviewDto.bookingId,
      reviewerId: userId,
      revieweeId: createReviewDto.revieweeId,
      rating: createReviewDto.rating,
      comment: createReviewDto.comment ?? null
    });

    try {
      const saved = await this.reviewsRepository.save(toSave);
      return this.toResponseDto(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('This reviewer already created a review for this booking');
      }

      throw error;
    }
  }

  async updateForUser(id: string, userId: string, updateReviewDto: UpdateReviewDto): Promise<ReviewResponseDto> {
    const review = await this.reviewsRepository.findOne({ where: { id } });

    if (!review) {
      throw new NotFoundException(`Review ${id} not found`);
    }

    if (review.reviewerId !== userId) {
      throw new ForbiddenException('Only the reviewer can update this review');
    }

    if (typeof updateReviewDto.rating === 'number') {
      this.validateRating(updateReviewDto.rating);
    }

    const updated = this.reviewsRepository.merge(review, {
      rating: typeof updateReviewDto.rating === 'number' ? updateReviewDto.rating : review.rating,
      comment:
        typeof updateReviewDto.comment === 'string' || updateReviewDto.comment === null
          ? updateReviewDto.comment
          : review.comment
    });

    const saved = await this.reviewsRepository.save(updated);
    return this.toResponseDto(saved);
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    const review = await this.reviewsRepository.findOne({ where: { id } });

    if (!review) {
      throw new NotFoundException(`Review ${id} not found`);
    }

    if (review.reviewerId !== userId) {
      throw new ForbiddenException('Only the reviewer can delete this review');
    }

    await this.reviewsRepository.delete({ id });
  }

  private async ensureBookingParticipant(bookingId: string, userId: string): Promise<BookingAccessRow> {
    const rows = await this.reviewsRepository.query(
      `
        SELECT b.id AS booking_id, v.owner_id, b.driver_id, b.status
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId]
    );

    const booking = (rows[0] as BookingAccessRow | undefined) ?? null;

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (booking.owner_id !== userId && booking.driver_id !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return booking;
  }

  private async filterReviewsByParticipation(
    reviews: ReviewEntity[],
    userId: string
  ): Promise<ReviewEntity[]> {
    if (reviews.length === 0) {
      return [];
    }

    const bookingIds = Array.from(new Set(reviews.map((review) => review.bookingId)));
    const rows = await this.reviewsRepository.query(
      `
        SELECT b.id AS booking_id, v.owner_id, b.driver_id
        FROM bookings b
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE b.id = ANY($1::uuid[])
      `,
      [bookingIds]
    );

    const allowedBookingIds = new Set(
      (rows as Array<{ booking_id: string; owner_id: string; driver_id: string }>)
        .filter((row) => row.owner_id === userId || row.driver_id === userId)
        .map((row) => row.booking_id)
    );

    return reviews.filter((review) => allowedBookingIds.has(review.bookingId));
  }

  private validateRating(rating: number): void {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be an integer between 1 and 5');
    }
  }

  private toResponseDto(item: ReviewEntity): ReviewResponseDto {
    return {
      id: item.id,
      bookingId: item.bookingId,
      reviewerId: item.reviewerId,
      revieweeId: item.revieweeId,
      rating: item.rating,
      comment: item.comment,
      createdAt: item.createdAt
    };
  }
}
