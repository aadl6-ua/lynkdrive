import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query('bookingId') bookingId?: string) {
    return this.reviewsService.findAllForUser(user.sub, bookingId);
  }

  @Get(':id')
  async findById(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.reviewsService.findByIdForUser(id, user.sub);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() createReviewDto: CreateReviewDto) {
    return this.reviewsService.createForUser(user.sub, createReviewDto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateReviewDto: UpdateReviewDto
  ) {
    return this.reviewsService.updateForUser(id, user.sub, updateReviewDto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.reviewsService.deleteForUser(id, user.sub);
  }
}
