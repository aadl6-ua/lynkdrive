import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { GetVehiclesFiltersDto } from './dto/get-vehicles-filters.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleResponseDto } from './dto/vehicle-response.dto';
import { VehicleEntity } from './entities/vehicle.entity';

type VehicleRow = {
  id: string;
  owner_id: string;
  brand: string;
  model: string;
  year: number;
  license_plate: string;
  description: string;
  price_per_day: string;
  location_lat: string;
  location_lng: string;
  location_address: string;
  fuel_type: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
  transmission: 'manual' | 'automatic' | null;
  seats: number | null;
  status: 'active' | 'inactive';
  created_at: Date;
};

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly vehiclesRepository: Repository<VehicleEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>
  ) {}

  async findAll(filters: GetVehiclesFiltersDto = {}): Promise<VehicleResponseDto[]> {
    const whereParts: string[] = ['deleted_at IS NULL'];
    const params: Array<string | number> = [];

    if (typeof filters.maxPrice === 'number' && !Number.isNaN(filters.maxPrice)) {
      params.push(filters.maxPrice);
      whereParts.push(`price_per_day <= $${params.length}`);
    }

    if (filters.fuelType) {
      params.push(filters.fuelType);
      whereParts.push(`fuel_type = $${params.length}`);
    }

    if (filters.transmission) {
      params.push(filters.transmission);
      whereParts.push(`transmission = $${params.length}`);
    }

    if (typeof filters.seats === 'number' && !Number.isNaN(filters.seats)) {
      params.push(filters.seats);
      whereParts.push(`seats >= $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      whereParts.push(`status = $${params.length}`);
    }

    const hasGeoFilter =
      typeof filters.lat === 'number' &&
      typeof filters.lng === 'number' &&
      typeof filters.radiusKm === 'number' &&
      !Number.isNaN(filters.lat) &&
      !Number.isNaN(filters.lng) &&
      !Number.isNaN(filters.radiusKm);

    if (hasGeoFilter) {
      params.push(filters.lng as number);
      const lngParamIndex = params.length;
      params.push(filters.lat as number);
      const latParamIndex = params.length;
      params.push((filters.radiusKm as number) * 1000);
      const radiusParamIndex = params.length;

      whereParts.push(
        `ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($${lngParamIndex}, $${latParamIndex}), 4326)::geography, $${radiusParamIndex})`
      );
    }

    const query = `
      SELECT
        id,
        owner_id,
        brand,
        model,
        year,
        license_plate,
        description,
        price_per_day,
        ST_Y(location)::text AS location_lat,
        ST_X(location)::text AS location_lng,
        location_address,
        fuel_type,
        transmission,
        seats,
        status,
        created_at
      FROM vehicles
      WHERE ${whereParts.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const rows = await this.vehiclesRepository.query(query, params);

    return rows.map((row: VehicleRow) => this.toResponseDto(row));
  }

  async findById(id: string): Promise<VehicleResponseDto> {
    const rows = await this.vehiclesRepository.query(
      `
        SELECT
          id,
          owner_id,
          brand,
          model,
          year,
          license_plate,
          description,
          price_per_day,
          ST_Y(location)::text AS location_lat,
          ST_X(location)::text AS location_lng,
          location_address,
          fuel_type,
          transmission,
          seats,
          status,
          created_at
        FROM vehicles
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `,
      [id]
    );

    const row = rows[0] as VehicleRow | undefined;

    if (!row) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }

    return this.toResponseDto(row);
  }

  async create(createVehicleDto: CreateVehicleDto): Promise<VehicleResponseDto> {
    await this.ensureOwnerExists(createVehicleDto.ownerId);
    await this.ensureLicensePlateAvailable(createVehicleDto.licensePlate);

    const rows = await this.vehiclesRepository.query(
      `
        INSERT INTO vehicles (
          owner_id,
          brand,
          model,
          year,
          license_plate,
          description,
          price_per_day,
          location,
          location_address,
          fuel_type,
          transmission,
          seats,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          ST_SetSRID(ST_MakePoint($8, $9), 4326),
          $10,
          $11,
          $12,
          $13,
          $14
        )
        RETURNING id
      `,
      [
        createVehicleDto.ownerId,
        createVehicleDto.brand,
        createVehicleDto.model,
        createVehicleDto.year,
        createVehicleDto.licensePlate,
        createVehicleDto.description,
        createVehicleDto.pricePerDay,
        createVehicleDto.locationLng,
        createVehicleDto.locationLat,
        createVehicleDto.locationAddress,
        createVehicleDto.fuelType ?? null,
        createVehicleDto.transmission ?? null,
        createVehicleDto.seats ?? null,
        createVehicleDto.status ?? 'active'
      ]
    );

    const createdId = rows[0]?.id as string | undefined;

    if (!createdId) {
      throw new ConflictException('Vehicle could not be created');
    }

    return this.findById(createdId);
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto): Promise<VehicleResponseDto> {
    const current = await this.findById(id);

    if (updateVehicleDto.ownerId && updateVehicleDto.ownerId !== current.ownerId) {
      await this.ensureOwnerExists(updateVehicleDto.ownerId);
    }

    if (updateVehicleDto.licensePlate && updateVehicleDto.licensePlate !== current.licensePlate) {
      await this.ensureLicensePlateAvailable(updateVehicleDto.licensePlate, id);
    }

    const nextOwnerId = updateVehicleDto.ownerId ?? current.ownerId;
    const nextBrand = updateVehicleDto.brand ?? current.brand;
    const nextModel = updateVehicleDto.model ?? current.model;
    const nextYear = updateVehicleDto.year ?? current.year;
    const nextLicensePlate = updateVehicleDto.licensePlate ?? current.licensePlate;
    const nextDescription = updateVehicleDto.description ?? current.description;
    const nextPricePerDay = updateVehicleDto.pricePerDay ?? current.pricePerDay;
    const nextLocationLat = updateVehicleDto.locationLat ?? current.locationLat;
    const nextLocationLng = updateVehicleDto.locationLng ?? current.locationLng;
    const nextLocationAddress = updateVehicleDto.locationAddress ?? current.locationAddress;
    const nextFuelType = updateVehicleDto.fuelType ?? current.fuelType;
    const nextTransmission = updateVehicleDto.transmission ?? current.transmission;
    const nextSeats = updateVehicleDto.seats ?? current.seats;
    const nextStatus = updateVehicleDto.status ?? current.status;

    await this.vehiclesRepository.query(
      `
        UPDATE vehicles
        SET
          owner_id = $1,
          brand = $2,
          model = $3,
          year = $4,
          license_plate = $5,
          description = $6,
          price_per_day = $7,
          location = ST_SetSRID(ST_MakePoint($8, $9), 4326),
          location_address = $10,
          fuel_type = $11,
          transmission = $12,
          seats = $13,
          status = $14
        WHERE id = $15 AND deleted_at IS NULL
      `,
      [
        nextOwnerId,
        nextBrand,
        nextModel,
        nextYear,
        nextLicensePlate,
        nextDescription,
        nextPricePerDay,
        nextLocationLng,
        nextLocationLat,
        nextLocationAddress,
        nextFuelType,
        nextTransmission,
        nextSeats,
        nextStatus,
        id
      ]
    );

    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    const existingVehicle = await this.vehiclesRepository.findOne({
      where: { id }
    });

    if (!existingVehicle || existingVehicle.deletedAt) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }

    await this.vehiclesRepository.softDelete({ id });
  }

  private async ensureOwnerExists(ownerId: string): Promise<void> {
    const owner = await this.usersRepository.findOne({
      where: { id: ownerId }
    });

    if (!owner || owner.deletedAt) {
      throw new NotFoundException(`Owner ${ownerId} not found`);
    }
  }

  private async ensureLicensePlateAvailable(licensePlate: string, currentVehicleId?: string): Promise<void> {
    const query = this.vehiclesRepository.createQueryBuilder('vehicle').where('vehicle.licensePlate = :licensePlate', {
      licensePlate
    });

    if (currentVehicleId) {
      query.andWhere('vehicle.id != :currentVehicleId', { currentVehicleId });
    }

    query.andWhere('vehicle.deletedAt IS NULL');

    const existingVehicle = await query.getOne();

    if (existingVehicle) {
      throw new ConflictException(`License plate ${licensePlate} already exists`);
    }
  }

  private toResponseDto(row: VehicleRow): VehicleResponseDto {
    return {
      id: row.id,
      ownerId: row.owner_id,
      brand: row.brand,
      model: row.model,
      year: Number(row.year),
      licensePlate: row.license_plate,
      description: row.description,
      pricePerDay: Number(row.price_per_day),
      locationLat: Number(row.location_lat),
      locationLng: Number(row.location_lng),
      locationAddress: row.location_address,
      fuelType: row.fuel_type,
      transmission: row.transmission,
      seats: row.seats,
      status: row.status,
      createdAt: new Date(row.created_at)
    };
  }
}
