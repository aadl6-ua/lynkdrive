import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { UploadsService } from './uploads.service';

type UploadTarget =
  | 'avatar'
  | 'id_document'
  | 'driver_license'
  | 'vehicle_image'
  | 'checklist_image';

class UploadImageBodyDto {
  ownerId?: string;
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images/:target')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage()
    })
  )
  async uploadImage(
    @Param('target') target: string,
    @Body() body: UploadImageBodyDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true
      })
    )
    file: Express.Multer.File
  ) {
    if (!this.isValidTarget(target)) {
      throw new BadRequestException('Target invalido');
    }

    return this.uploadsService.uploadImage(target, body.ownerId, file);
  }

  private isValidTarget(target: string): target is UploadTarget {
    return ['avatar', 'id_document', 'driver_license', 'vehicle_image', 'checklist_image'].includes(target);
  }
}
