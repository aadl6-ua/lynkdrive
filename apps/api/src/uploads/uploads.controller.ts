import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { UploadsService } from './uploads.service';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

type UploadTarget =
  | 'avatar'
  | 'id_document'
  | 'driver_license'
  | 'vehicle_image'
  | 'checklist_image';

class UploadImageBodyDto {
  ownerId?: string;
}

@UseGuards(SupabaseJwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images/:target')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 }
    })
  )
  async uploadImage(
    @CurrentUser() user: AuthUser,
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

    return this.uploadsService.uploadImage(target, user.sub, body?.ownerId, file);
  }

  private isValidTarget(target: string): target is UploadTarget {
    return ['avatar', 'id_document', 'driver_license', 'vehicle_image', 'checklist_image'].includes(target);
  }
}
