import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { ChecklistImagesService } from './checklist-images.service';
import { CreateChecklistImageDto } from './dto/create-checklist-image.dto';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('checklist-images')
export class ChecklistImagesController {
  constructor(private readonly checklistImagesService: ChecklistImagesService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query('checklistId') checklistId?: string) {
    return this.checklistImagesService.findAllForUser(user.sub, checklistId ?? '');
  }

  @Get(':id')
  async findById(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.checklistImagesService.findByIdForUser(id, user.sub);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() createChecklistImageDto: CreateChecklistImageDto) {
    return this.checklistImagesService.createForUser(user.sub, createChecklistImageDto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.checklistImagesService.deleteForUser(id, user.sub);
  }
}
