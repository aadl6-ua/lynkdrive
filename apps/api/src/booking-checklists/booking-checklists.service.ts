import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BookingChecklistResponseDto } from './dto/booking-checklist-response.dto';
import { CreateBookingChecklistDto } from './dto/create-booking-checklist.dto';
import { UpdateBookingChecklistDto } from './dto/update-booking-checklist.dto';
import { BookingChecklistEntity } from './entities/booking-checklist.entity';

type BookingAccessRow = {
  booking_id: string;
  owner_id: string;
  driver_id: string;
};

@Injectable()
export class BookingChecklistsService {
  constructor(
    @InjectRepository(BookingChecklistEntity)
    private readonly bookingChecklistsRepository: Repository<BookingChecklistEntity>
  ) {}

  async findAllForUser(userId: string, bookingId: string): Promise<BookingChecklistResponseDto[]> {
    if (!bookingId) {
      throw new BadRequestException('bookingId query param is required');
    }

    await this.ensureBookingParticipant(bookingId, userId);

    const checklists = await this.bookingChecklistsRepository.find({
      where: { bookingId },
      order: { createdAt: 'ASC' }
    });

    return checklists.map((item) => this.toResponseDto(item));
  }

  async findByIdForUser(id: string, userId: string): Promise<BookingChecklistResponseDto> {
    const checklist = await this.bookingChecklistsRepository.findOne({ where: { id } });

    if (!checklist) {
      throw new NotFoundException(`Booking checklist ${id} not found`);
    }

    await this.ensureBookingParticipant(checklist.bookingId, userId);

    return this.toResponseDto(checklist);
  }

  async createForUser(
    userId: string,
    createBookingChecklistDto: CreateBookingChecklistDto
  ): Promise<BookingChecklistResponseDto> {
    await this.ensureBookingParticipant(createBookingChecklistDto.bookingId, userId);
    this.validateFuelLevel(createBookingChecklistDto.fuelLevel);

    const checklistToSave = this.bookingChecklistsRepository.create({
      bookingId: createBookingChecklistDto.bookingId,
      type: createBookingChecklistDto.type,
      submittedBy: userId,
      mileage: createBookingChecklistDto.mileage,
      fuelLevel: createBookingChecklistDto.fuelLevel,
      notes: createBookingChecklistDto.notes ?? null
    });

    try {
      const saved = await this.bookingChecklistsRepository.save(checklistToSave);
      return this.toResponseDto(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Checklist for this booking and type already exists');
      }

      throw error;
    }
  }

  async updateForUser(
    id: string,
    userId: string,
    updateBookingChecklistDto: UpdateBookingChecklistDto
  ): Promise<BookingChecklistResponseDto> {
    const existing = await this.bookingChecklistsRepository.findOne({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`Booking checklist ${id} not found`);
    }

    await this.ensureBookingParticipant(existing.bookingId, userId);
    this.ensureSubmitter(existing.submittedBy, userId);

    const nextFuelLevel =
      typeof updateBookingChecklistDto.fuelLevel === 'number'
        ? updateBookingChecklistDto.fuelLevel
        : existing.fuelLevel;

    this.validateFuelLevel(nextFuelLevel);

    const updated = this.bookingChecklistsRepository.merge(existing, {
      mileage:
        typeof updateBookingChecklistDto.mileage === 'number'
          ? updateBookingChecklistDto.mileage
          : existing.mileage,
      fuelLevel: nextFuelLevel,
      notes:
        typeof updateBookingChecklistDto.notes === 'string' || updateBookingChecklistDto.notes === null
          ? updateBookingChecklistDto.notes
          : existing.notes
    });

    const saved = await this.bookingChecklistsRepository.save(updated);
    return this.toResponseDto(saved);
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    const existing = await this.bookingChecklistsRepository.findOne({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`Booking checklist ${id} not found`);
    }

    await this.ensureBookingParticipant(existing.bookingId, userId);
    this.ensureSubmitter(existing.submittedBy, userId);
    await this.bookingChecklistsRepository.delete({ id });
  }

  private ensureSubmitter(submittedBy: string, userId: string): void {
    if (submittedBy !== userId) {
      throw new ForbiddenException('Only the user who submitted this checklist can modify it');
    }
  }

  private async ensureBookingParticipant(bookingId: string, userId: string): Promise<void> {
    const rows = await this.bookingChecklistsRepository.query(
      `
        SELECT b.id AS booking_id, v.owner_id, b.driver_id
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
  }

  private validateFuelLevel(fuelLevel: number): void {
    if (Number.isNaN(fuelLevel) || fuelLevel < 0 || fuelLevel > 100) {
      throw new BadRequestException('fuelLevel must be between 0 and 100');
    }
  }

  private toResponseDto(item: BookingChecklistEntity): BookingChecklistResponseDto {
    return {
      id: item.id,
      bookingId: item.bookingId,
      type: item.type,
      submittedBy: item.submittedBy,
      mileage: item.mileage,
      fuelLevel: item.fuelLevel,
      notes: item.notes,
      createdAt: item.createdAt
    };
  }
}
