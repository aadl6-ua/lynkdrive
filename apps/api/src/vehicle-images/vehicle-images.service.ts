import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { VehicleEntity } from '../vehicles/entities/vehicle.entity';
import { CreateVehicleImageDto } from './dto/create-vehicle-image.dto';
import { UpdateVehicleImageDto } from './dto/update-vehicle-image.dto';
import { VehicleImageResponseDto } from './dto/vehicle-image-response.dto';
import { VehicleImageEntity } from './entities/vehicle-image.entity';

@Injectable()
export class VehicleImagesService {
  constructor(
    @InjectRepository(VehicleImageEntity)
    private readonly vehicleImagesRepository: Repository<VehicleImageEntity>,
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

  async findAll(vehicleId?: string): Promise<VehicleImageResponseDto[]> {
    const where = vehicleId ? { vehicleId } : undefined;

    const images = await this.vehicleImagesRepository.find({
      where,
      order: { createdAt: 'DESC' }
    });

    return images.map((image) => this.toResponseDto(image));
  }

  async findById(id: string): Promise<VehicleImageResponseDto> {
    const image = await this.vehicleImagesRepository.findOne({
      where: { id }
    });

    if (!image) {
      throw new NotFoundException(`Vehicle image ${id} not found`);
    }

    return this.toResponseDto(image);
  }

  async create(createVehicleImageDto: CreateVehicleImageDto): Promise<VehicleImageResponseDto> {
    await this.ensureVehicleExists(createVehicleImageDto.vehicleId);

    const existingImagesCount = await this.vehicleImagesRepository.count({
      where: { vehicleId: createVehicleImageDto.vehicleId }
    });

    // If this is the first image for the vehicle, make it primary by default.
    const shouldBePrimary = existingImagesCount === 0 ? true : (createVehicleImageDto.isPrimary ?? false);

    if (shouldBePrimary) {
      await this.unsetPrimaryImage(createVehicleImageDto.vehicleId);
    }

    const imageToSave = this.vehicleImagesRepository.create({
      vehicleId: createVehicleImageDto.vehicleId,
      imageUrl: createVehicleImageDto.imageUrl,
      isPrimary: shouldBePrimary
    });

    const savedImage = await this.vehicleImagesRepository.save(imageToSave);

    return this.toResponseDto(savedImage);
  }

  async createForOwner(
    ownerId: string,
    createVehicleImageDto: CreateVehicleImageDto
  ): Promise<VehicleImageResponseDto> {
    await this.ensureVehicleOwnership(createVehicleImageDto.vehicleId, ownerId);
    return this.create(createVehicleImageDto);
  }

  async update(id: string, updateVehicleImageDto: UpdateVehicleImageDto): Promise<VehicleImageResponseDto> {
    const existingImage = await this.vehicleImagesRepository.findOne({
      where: { id }
    });

    if (!existingImage) {
      throw new NotFoundException(`Vehicle image ${id} not found`);
    }

    if (typeof updateVehicleImageDto.isPrimary === 'boolean' && updateVehicleImageDto.isPrimary) {
      await this.unsetPrimaryImage(existingImage.vehicleId, existingImage.id);
    }

    const updatedImage = this.vehicleImagesRepository.merge(existingImage, {
      imageUrl: updateVehicleImageDto.imageUrl ?? existingImage.imageUrl,
      isPrimary:
        typeof updateVehicleImageDto.isPrimary === 'boolean'
          ? updateVehicleImageDto.isPrimary
          : existingImage.isPrimary
    });

    const savedImage = await this.vehicleImagesRepository.save(updatedImage);

    return this.toResponseDto(savedImage);
  }

  async updateForOwner(
    id: string,
    ownerId: string,
    updateVehicleImageDto: UpdateVehicleImageDto
  ): Promise<VehicleImageResponseDto> {
    const image = await this.vehicleImagesRepository.findOne({
      where: { id },
      select: { id: true, vehicleId: true }
    });

    if (!image) {
      throw new NotFoundException(`Vehicle image ${id} not found`);
    }

    await this.ensureVehicleOwnership(image.vehicleId, ownerId);
    return this.update(id, updateVehicleImageDto);
  }

  async delete(id: string): Promise<void> {
    const existingImage = await this.vehicleImagesRepository.findOne({
      where: { id }
    });

    if (!existingImage) {
      throw new NotFoundException(`Vehicle image ${id} not found`);
    }

    await this.vehicleImagesRepository.delete({ id });
  }

  async softDeleteForOwner(id: string, ownerId: string): Promise<void> {
    const image = await this.vehicleImagesRepository.findOne({
      where: { id },
      select: { id: true, vehicleId: true }
    });

    if (!image) {
      throw new NotFoundException(`Vehicle image ${id} not found`);
    }

    await this.ensureVehicleOwnership(image.vehicleId, ownerId);
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

  private async unsetPrimaryImage(vehicleId: string, excludeId?: string): Promise<void> {
    const currentPrimary = await this.vehicleImagesRepository.findOne({
      where: { vehicleId, isPrimary: true }
    });

    if (!currentPrimary) {
      return;
    }

    if (excludeId && currentPrimary.id === excludeId) {
      return;
    }

    currentPrimary.isPrimary = false;

    try {
      await this.vehicleImagesRepository.save(currentPrimary);
    } catch {
      throw new ConflictException('Could not update current primary image');
    }
  }

  private toResponseDto(image: VehicleImageEntity): VehicleImageResponseDto {
    return {
      id: image.id,
      vehicleId: image.vehicleId,
      imageUrl: image.imageUrl,
      isPrimary: image.isPrimary,
      createdAt: image.createdAt
    };
  }
}
