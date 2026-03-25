import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistImageEntity } from './entities/checklist-image.entity';
import { ChecklistImagesController } from './checklist-images.controller';
import { ChecklistImagesService } from './checklist-images.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChecklistImageEntity])],
  controllers: [ChecklistImagesController],
  providers: [ChecklistImagesService],
  exports: [ChecklistImagesService]
})
export class ChecklistImagesModule {}
