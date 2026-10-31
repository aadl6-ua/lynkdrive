import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  getStorageBuckets,
  getSupabaseAdminClient,
  isAcceptableImageValue,
  isStorageReferenceOwnedBy,
  parseStorageReference,
  removeStorageReferences,
  StorageReference
} from '../common/supabase-storage';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { ReviewEntity } from '../reviews/entities/review.entity';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserOverviewResponseDto } from './dto/user-overview-response.dto';
import { PublicUserResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(BookingEntity)
    private readonly bookingsRepository: Repository<BookingEntity>,
    @InjectRepository(ReviewEntity)
    private readonly reviewsRepository: Repository<ReviewEntity>
  ) {}

  async findPublicById(id: string): Promise<PublicUserResponseDto> {
    return this.toPublicDto(await this.findById(id));
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

    const buckets = getStorageBuckets();
    this.ensureImageValue(updateUserDto.avatarUrl, id, 'avatarUrl', { buckets: [buckets.avatars], allowExternal: true });
    this.ensureImageValue(updateUserDto.idDocumentUrl, id, 'idDocumentUrl', { buckets: [buckets.documents], allowExternal: false });
    this.ensureImageValue(updateUserDto.driverLicenseUrl, id, 'driverLicenseUrl', {
      buckets: [buckets.documents],
      allowExternal: false
    });

    // undefined conserva el valor actual; null lo borra (p. ej. eliminar un documento o el avatar).
    const pick = <T>(value: T | undefined, current: T): T => (value === undefined ? current : value);
    const previous = { ...user };

    const updatedUser = this.usersRepository.merge(user, {
      firstName: updateUserDto.firstName?.trim() || user.firstName,
      lastName: updateUserDto.lastName?.trim() || user.lastName,
      phoneNumber: pick(updateUserDto.phoneNumber, user.phoneNumber),
      avatarUrl: pick(updateUserDto.avatarUrl, user.avatarUrl),
      idDocumentUrl: pick(updateUserDto.idDocumentUrl, user.idDocumentUrl),
      driverLicenseUrl: pick(updateUserDto.driverLicenseUrl, user.driverLicenseUrl)
    });

    // Si cambia la documentación, la verificación anterior deja de ser válida.
    if (
      updatedUser.idDocumentUrl !== previous.idDocumentUrl ||
      updatedUser.driverLicenseUrl !== previous.driverLicenseUrl
    ) {
      updatedUser.isVerified = false;
    }

    const savedUser = await this.usersRepository.save(updatedUser);

    await this.removeReplacedFiles(id, [
      [previous.avatarUrl, savedUser.avatarUrl],
      [previous.idDocumentUrl, savedUser.idDocumentUrl],
      [previous.driverLicenseUrl, savedUser.driverLicenseUrl]
    ]);

    return this.toResponseDto(savedUser);
  }

  private ensureImageValue(
    value: string | null | undefined,
    userId: string,
    field: string,
    options: { buckets: string[]; allowExternal: boolean }
  ): void {
    if (value && !isAcceptableImageValue(value, userId, options)) {
      throw new BadRequestException(`${field} no es una imagen subida por ti`);
    }
  }

  // Borrado best-effort de ficheros sustituidos o eliminados para no dejar documentos huérfanos.
  private async removeReplacedFiles(userId: string, pairs: Array<[string | null, string | null]>): Promise<void> {
    const references = pairs
      .filter(([before, after]) => before && before !== after)
      .map(([before]) => parseStorageReference(before))
      .filter(
        (reference): reference is StorageReference =>
          reference !== null && isStorageReferenceOwnedBy(reference, userId)
      );

    try {
      const failed = await removeStorageReferences(getSupabaseAdminClient(), references);

      if (failed.length > 0) {
        this.logger.warn(`No se pudieron borrar ficheros sustituidos en ${failed.join(', ')}`);
      }
    } catch {
      this.logger.warn('No se pudieron borrar ficheros sustituidos');
    }
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
        .andWhere('review.hidden_at IS NULL')
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

  // Perfil visible para terceros: sin telefono ni documentos personales.
  private toPublicDto(user: UserResponseDto): PublicUserResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
      createdAt: user.createdAt
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
