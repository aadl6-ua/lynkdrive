import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { EarningsService } from './earnings.service';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('mine')
  async findMine(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.earningsService.findMine(user.sub, { from: query.from, to: query.to });
  }
}
