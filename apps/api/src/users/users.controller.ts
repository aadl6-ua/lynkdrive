import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { AuthUser } from 'src/auth/auth-user.type';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { AccountService } from './account.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountService: AccountService
  ) {}

  @UseGuards(SupabaseJwtAuthGuard)
  @Get()
  async findAll() {
    return this.usersService.findAllPublic();
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Get('me')
  async findMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findById(user.sub);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Get('me/export')
  async exportMe(@CurrentUser() user: AuthUser) {
    return this.accountService.exportData(user);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: AuthUser) {
    await this.accountService.deleteAccount(user);
  }

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findPublicById(id);
  }

  @Get(':id/overview')
  async findOverview(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findOverview(id);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() createUserDto: CreateUserDto) {
    this.ensureSelf(user, createUserDto.id);
    return this.usersService.create(createUserDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Put('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(user.sub, updateUserDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUserDto: UpdateUserDto
  ) {
    this.ensureSelf(user, id);
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(SupabaseJwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  async softDelete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    this.ensureSelf(user, id);
    await this.usersService.softDelete(id);
  }

  private ensureSelf(user: AuthUser, targetId: string | undefined): void {
    if (!targetId || targetId !== user.sub) {
      throw new ForbiddenException('Solo puedes operar sobre tu propio usuario');
    }
  }
}
