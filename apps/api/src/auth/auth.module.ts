import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { SupabaseJwtAuthGuard } from './supabase-jwt-auth.guard';

@Module({
  providers: [SupabaseJwtAuthGuard, AdminGuard],
  exports: [SupabaseJwtAuthGuard, AdminGuard]
})
export class AuthModule {}
