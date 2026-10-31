import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getStorageBuckets, isAcceptableImageValue } from '../common/supabase-storage';
import { ChecklistImageResponseDto } from './dto/checklist-image-response.dto';
import { CreateChecklistImageDto } from './dto/create-checklist-image.dto';
import { ChecklistImageEntity } from './entities/checklist-image.entity';

type ChecklistAccessRow = {
  checklist_id: string;
  booking_id: string;
  owner_id: string;
  driver_id: string;
  submitted_by: string;
};

@Injectable()
export class ChecklistImagesService {
  constructor(
    @InjectRepository(ChecklistImageEntity)
    private readonly checklistImagesRepository: Repository<ChecklistImageEntity>
  ) {}

  async findAllForUser(userId: string, checklistId: string): Promise<ChecklistImageResponseDto[]> {
    if (!checklistId) {
      throw new BadRequestException('checklistId query param is required');
    }

    await this.ensureChecklistParticipant(checklistId, userId);

    const images = await this.checklistImagesRepository.find({
      where: { checklistId },
      order: { createdAt: 'ASC' }
    });

    return images.map((item) => this.toResponseDto(item));
  }

  async findByIdForUser(id: string, userId: string): Promise<ChecklistImageResponseDto> {
    const image = await this.checklistImagesRepository.findOne({ where: { id } });

    if (!image) {
      throw new NotFoundException(`Checklist image ${id} not found`);
    }

    await this.ensureChecklistParticipant(image.checklistId, userId);
    return this.toResponseDto(image);
  }

  async createForUser(userId: string, createChecklistImageDto: CreateChecklistImageDto): Promise<ChecklistImageResponseDto> {
    await this.ensureChecklistParticipant(createChecklistImageDto.checklistId, userId, true);

    const { checklists } = getStorageBuckets();

    // Solo evidencias del bucket privado subidas por el propio usuario.
    if (!isAcceptableImageValue(createChecklistImageDto.imageUrl, userId, { buckets: [checklists], allowExternal: false })) {
      throw new BadRequestException('imageUrl debe ser una imagen de checklist subida por ti');
    }

    const toSave = this.checklistImagesRepository.create({
      checklistId: createChecklistImageDto.checklistId,
      imageUrl: createChecklistImageDto.imageUrl
    });

    const saved = await this.checklistImagesRepository.save(toSave);
    return this.toResponseDto(saved);
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    const image = await this.checklistImagesRepository.findOne({ where: { id } });

    if (!image) {
      throw new NotFoundException(`Checklist image ${id} not found`);
    }

    await this.ensureChecklistParticipant(image.checklistId, userId, true);
    await this.checklistImagesRepository.delete({ id });
  }

  private async ensureChecklistParticipant(
    checklistId: string,
    userId: string,
    requireSubmitter = false
  ): Promise<void> {
    const rows = await this.checklistImagesRepository.query(
      `
        SELECT c.id AS checklist_id, c.booking_id, c.submitted_by, v.owner_id, b.driver_id
        FROM booking_checklists c
        INNER JOIN bookings b ON b.id = c.booking_id
        INNER JOIN vehicles v ON v.id = b.vehicle_id
        WHERE c.id = $1
        LIMIT 1
      `,
      [checklistId]
    );

    const checklist = (rows[0] as ChecklistAccessRow | undefined) ?? null;

    if (!checklist) {
      throw new NotFoundException(`Booking checklist ${checklistId} not found`);
    }

    if (checklist.owner_id !== userId && checklist.driver_id !== userId) {
      throw new ForbiddenException('You do not have access to this checklist');
    }

    if (requireSubmitter && checklist.submitted_by !== userId) {
      throw new ForbiddenException('Only the user who submitted this checklist can modify its images');
    }
  }

  private toResponseDto(item: ChecklistImageEntity): ChecklistImageResponseDto {
    return {
      id: item.id,
      checklistId: item.checklistId,
      imageUrl: item.imageUrl,
      createdAt: item.createdAt
    };
  }
}
