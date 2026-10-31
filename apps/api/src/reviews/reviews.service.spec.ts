import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ReviewEntity } from './entities/review.entity';
import { ReviewsService } from './reviews.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let bookingStatus: BookingStatus;
  let bookingExists: boolean;

  const reviewsRepository = {
    query: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: Partial<ReviewEntity>) => ({ ...data })),
    save: jest.fn(async (data: Partial<ReviewEntity>) => ({ id: 'review-1', createdAt: new Date(), ...data })),
    merge: jest.fn((entity: ReviewEntity, data: Partial<ReviewEntity>) => ({ ...entity, ...data })),
    delete: jest.fn()
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    bookingStatus = 'completed';
    bookingExists = true;

    reviewsRepository.query.mockImplementation(async () =>
      bookingExists
        ? [{ booking_id: BOOKING_ID, owner_id: OWNER_ID, driver_id: DRIVER_ID, status: bookingStatus }]
        : []
    );

    const moduleRef = await Test.createTestingModule({
      providers: [ReviewsService, { provide: getRepositoryToken(ReviewEntity), useValue: reviewsRepository }]
    }).compile();

    service = moduleRef.get(ReviewsService);
  });

  const dto = (overrides: Record<string, unknown> = {}) => ({
    bookingId: BOOKING_ID,
    revieweeId: OWNER_ID,
    rating: 5,
    comment: 'Todo perfecto',
    ...overrides
  });

  const nonCompleted: BookingStatus[] = ['pending', 'accepted', 'rejected', 'paid_confirmed', 'in_progress', 'cancelled'];

  it.each(nonCompleted)('no permite reseñar si el booking esta en %s', async (status) => {
    bookingStatus = status;
    await expect(service.createForUser(DRIVER_ID, dto())).rejects.toThrow(
      'Solo puedes valorar reservas completadas'
    );
    expect(reviewsRepository.save).not.toHaveBeenCalled();
  });

  it('permite al driver reseñar al owner con booking completed', async () => {
    const result = await service.createForUser(DRIVER_ID, dto());

    expect(result).toMatchObject({
      bookingId: BOOKING_ID,
      reviewerId: DRIVER_ID,
      revieweeId: OWNER_ID,
      rating: 5,
      comment: 'Todo perfecto'
    });
  });

  it('permite al owner reseñar al driver', async () => {
    const result = await service.createForUser(OWNER_ID, dto({ revieweeId: DRIVER_ID, comment: undefined }));
    expect(result).toMatchObject({ reviewerId: OWNER_ID, revieweeId: DRIVER_ID, comment: null });
  });

  it('no permite auto-reseñarse', async () => {
    await expect(service.createForUser(DRIVER_ID, dto({ revieweeId: DRIVER_ID }))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('exige que el reviewee sea la otra parte del booking', async () => {
    await expect(service.createForUser(DRIVER_ID, dto({ revieweeId: STRANGER_ID }))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('prohibe reseñar a quien no participa en el booking', async () => {
    await expect(service.createForUser(STRANGER_ID, dto())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza NotFound si el booking no existe', async () => {
    bookingExists = false;
    await expect(service.createForUser(DRIVER_ID, dto())).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([0, 6, 3.5, Number.NaN])('rechaza rating invalido %p', async (rating) => {
    await expect(service.createForUser(DRIVER_ID, dto({ rating }))).rejects.toThrow(
      'rating must be an integer between 1 and 5'
    );
  });

  it('traduce la violacion de unicidad a Conflict', async () => {
    const error = new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' }));
    reviewsRepository.save.mockRejectedValueOnce(error);

    await expect(service.createForUser(DRIVER_ID, dto())).rejects.toBeInstanceOf(ConflictException);
  });

  it('solo el autor puede editar o borrar su reseña', async () => {
    reviewsRepository.findOne.mockResolvedValue({
      id: 'review-1',
      bookingId: BOOKING_ID,
      reviewerId: DRIVER_ID,
      revieweeId: OWNER_ID,
      rating: 4,
      comment: null,
      createdAt: new Date()
    });

    await expect(service.updateForUser('review-1', OWNER_ID, { rating: 1 })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(service.deleteForUser('review-1', OWNER_ID)).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.updateForUser('review-1', DRIVER_ID, { rating: 2 })).resolves.toMatchObject({ rating: 2 });
    await expect(service.updateForUser('review-1', DRIVER_ID, { rating: 9 })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
