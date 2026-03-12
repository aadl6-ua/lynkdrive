import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { CreateVehicleAvailabilityWindowDto } from './dto/create-vehicle-availability-window.dto';
import { UpdateVehicleAvailabilityWindowDto } from './dto/update-vehicle-availability-window.dto';
import { VehicleAvailabilityWindowResponseDto } from './dto/vehicle-availability-window-response.dto';
import { VehicleAvailabilityWindowEntity } from './entities/vehicle-availability-window.entity';

@Injectable()
export class VehicleAvailabilityWindowsService {
  constructor(
    @InjectRepository(VehicleAvailabilityWindowEntity)
    private readonly vehicleAvailabilityWindowsRepository: Repository<VehicleAvailabilityWindowEntity>,
    @InjectRepository(VehicleEntity)
    private readonly vehiclesRepository: Repository<VehicleEntity>
  ) {}

  private async ensureVehicleOwnership(vehicleId: string, ownerId: string): Promise<void> {
    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: vehicleId, deletedAt: IsNull() },
      select: { id: true, ownerId: true }
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }

    if (vehicle.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this vehicle');
    }
  }

  async findAll(vehicleId?: string): Promise<VehicleAvailabilityWindowResponseDto[]> {
    const where = vehicleId ? { vehicleId } : undefined;

    const windows = await this.vehicleAvailabilityWindowsRepository.find({
      where,
      order: { startDatetime: 'ASC' }
    });

    return windows.map((window) => this.toResponseDto(window));
  }

  async findById(id: string): Promise<VehicleAvailabilityWindowResponseDto> {
    const window = await this.vehicleAvailabilityWindowsRepository.findOne({
      where: { id }
    });

    if (!window) {
      throw new NotFoundException(`Vehicle availability window ${id} not found`);
    }

    return this.toResponseDto(window);
  }

  async create(
    createVehicleAvailabilityWindowDto: CreateVehicleAvailabilityWindowDto
  ): Promise<VehicleAvailabilityWindowResponseDto> {
    await this.ensureVehicleExists(createVehicleAvailabilityWindowDto.vehicleId);

    const startDatetime = this.parseDateOrThrow(
      createVehicleAvailabilityWindowDto.startDatetime,
      'startDatetime'
    );
    const endDatetime = this.parseDateOrThrow(
      createVehicleAvailabilityWindowDto.endDatetime,
      'endDatetime'
    );

    this.validateDateRange(startDatetime, endDatetime);

    const windowToSave = this.vehicleAvailabilityWindowsRepository.create({
      vehicleId: createVehicleAvailabilityWindowDto.vehicleId,
      startDatetime,
      endDatetime
    });

    const savedWindow = await this.vehicleAvailabilityWindowsRepository.save(windowToSave);

    return this.toResponseDto(savedWindow);
  }

  async createForOwner(
    ownerId: string,
    createVehicleAvailabilityWindowDto: CreateVehicleAvailabilityWindowDto
  ): Promise<VehicleAvailabilityWindowResponseDto> {
    await this.ensureVehicleOwnership(createVehicleAvailabilityWindowDto.vehicleId, ownerId);
    return this.create(createVehicleAvailabilityWindowDto);
  }

  async update(
    id: string,
    updateVehicleAvailabilityWindowDto: UpdateVehicleAvailabilityWindowDto
  ): Promise<VehicleAvailabilityWindowResponseDto> {
    const existingWindow = await this.vehicleAvailabilityWindowsRepository.findOne({
      where: { id }
    });

    if (!existingWindow) {
      throw new NotFoundException(`Vehicle availability window ${id} not found`);
    }

    const nextStartDatetime = updateVehicleAvailabilityWindowDto.startDatetime
      ? this.parseDateOrThrow(updateVehicleAvailabilityWindowDto.startDatetime, 'startDatetime')
      : existingWindow.startDatetime;

    const nextEndDatetime = updateVehicleAvailabilityWindowDto.endDatetime
      ? this.parseDateOrThrow(updateVehicleAvailabilityWindowDto.endDatetime, 'endDatetime')
      : existingWindow.endDatetime;

    this.validateDateRange(nextStartDatetime, nextEndDatetime);

    const updatedWindow = this.vehicleAvailabilityWindowsRepository.merge(existingWindow, {
      startDatetime: nextStartDatetime,
      endDatetime: nextEndDatetime
    });

    const savedWindow = await this.vehicleAvailabilityWindowsRepository.save(updatedWindow);

    return this.toResponseDto(savedWindow);
  }

  async updateForOwner(
    id: string,
    ownerId: string,
    updateVehicleAvailabilityWindowDto: UpdateVehicleAvailabilityWindowDto
  ): Promise<VehicleAvailabilityWindowResponseDto> {
    const window = await this.vehicleAvailabilityWindowsRepository.findOne({ where: { id } });

    if (!window) {
      throw new NotFoundException(`Vehicle availability window ${id} not found`);
    }

    await this.ensureVehicleOwnership(window.vehicleId, ownerId);
    return this.update(id, updateVehicleAvailabilityWindowDto);
  }

  async delete(id: string): Promise<void> {
    const existingWindow = await this.vehicleAvailabilityWindowsRepository.findOne({
      where: { id }
    });

    if (!existingWindow) {
      throw new NotFoundException(`Vehicle availability window ${id} not found`);
    }

    await this.vehicleAvailabilityWindowsRepository.delete({ id });
  }

  async softDeleteForOwner(id: string, ownerId: string): Promise<void> {
    const window = await this.vehicleAvailabilityWindowsRepository.findOne({ where: { id } });

    if (!window) {
      throw new NotFoundException(`Vehicle availability window ${id} not found`);
    }

    await this.ensureVehicleOwnership(window.vehicleId, ownerId);
    await this.delete(id);
  }

  private async ensureVehicleExists(vehicleId: string): Promise<void> {
    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: vehicleId, deletedAt: IsNull() }
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }
  }

  private parseDateOrThrow(value: string, fieldName: string): Date {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO datetime`);
    }

    return parsedDate;
  }

  private validateDateRange(startDatetime: Date, endDatetime: Date): void {
    if (endDatetime < startDatetime) {
      throw new BadRequestException('endDatetime must be greater than or equal to startDatetime');
    }
  }

  private toResponseDto(
    window: VehicleAvailabilityWindowEntity
  ): VehicleAvailabilityWindowResponseDto {
    return {
      id: window.id,
      vehicleId: window.vehicleId,
      startDatetime: window.startDatetime,
      endDatetime: window.endDatetime,
      createdAt: window.createdAt
    };
  }
}
