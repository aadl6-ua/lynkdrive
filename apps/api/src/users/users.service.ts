import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { ReviewEntity } from '../reviews/entities/review.entity';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserOverviewResponseDto } from './dto/user-overview-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(BookingEntity)
    private readonly bookingsRepository: Repository<BookingEntity>,
    @InjectRepository(ReviewEntity)
    private readonly reviewsRepository: Repository<ReviewEntity>
  ) {}

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' }
    });

    return users.map((user) => this.toResponseDto(user));
  }

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id, deletedAt: IsNull() }
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return this.toResponseDto(user);
  }

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const existingUser = await this.usersRepository.findOne({
      where: { id: createUserDto.id },
      withDeleted: true
    });

    if (existingUser && !existingUser.deletedAt) {
      throw new ConflictException(`User ${createUserDto.id} already exists`);
    }

    const userToSave = this.usersRepository.create({
      id: createUserDto.id,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      phoneNumber: createUserDto.phoneNumber ?? null,
      avatarUrl: createUserDto.avatarUrl ?? null,
      idDocumentUrl: createUserDto.idDocumentUrl ?? null,
      driverLicenseUrl: createUserDto.driverLicenseUrl ?? null,
      deletedAt: null
    });

    const savedUser = await this.usersRepository.save(userToSave);

    return this.toResponseDto(savedUser);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id, deletedAt: IsNull() }
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const updatedUser = this.usersRepository.merge(user, {
      firstName: updateUserDto.firstName ?? user.firstName,
      lastName: updateUserDto.lastName ?? user.lastName,
      phoneNumber: updateUserDto.phoneNumber ?? user.phoneNumber,
      avatarUrl: updateUserDto.avatarUrl ?? user.avatarUrl,
      idDocumentUrl: updateUserDto.idDocumentUrl ?? user.idDocumentUrl,
      driverLicenseUrl: updateUserDto.driverLicenseUrl ?? user.driverLicenseUrl
    });

    const savedUser = await this.usersRepository.save(updatedUser);

    return this.toResponseDto(savedUser);
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id, deletedAt: IsNull() }
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    await this.usersRepository.softDelete({ id });
  }

  async findOverview(id: string): Promise<UserOverviewResponseDto> {
    await this.findById(id);

    const [completedTripsAsDriver, completedTripsAsOwner, ratingsStats] = await Promise.all([
      this.bookingsRepository.count({
        where: {
          driverId: id,
          status: 'completed'
        }
      }),
      this.bookingsRepository
        .createQueryBuilder('booking')
        .innerJoin(VehicleEntity, 'vehicle', 'vehicle.id = booking.vehicle_id')
        .where('vehicle.owner_id = :userId', { userId: id })
        .andWhere('vehicle.deleted_at IS NULL')
        .andWhere('booking.status = :status', { status: 'completed' })
        .getCount(),
      this.reviewsRepository
        .createQueryBuilder('review')
        .select('COUNT(review.id)', 'count')
        .addSelect('AVG(review.rating)', 'avg')
        .where('review.reviewee_id = :userId', { userId: id })
        .getRawOne<{ count: string; avg: string | null }>()
    ]);

    const ratingsCount = Number(ratingsStats?.count ?? 0);
    const averageRatingRaw = ratingsStats?.avg;

    return {
      userId: id,
      completedTripsAsDriver,
      completedTripsAsOwner,
      averageRating: averageRatingRaw === null ? null : Number(averageRatingRaw),
      ratingsCount
    };
  }

  private toResponseDto(user: UserEntity): UserResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      idDocumentUrl: user.idDocumentUrl,
      driverLicenseUrl: user.driverLicenseUrl,
      isVerified: user.isVerified,
      createdAt: user.createdAt
    };
  }
}
