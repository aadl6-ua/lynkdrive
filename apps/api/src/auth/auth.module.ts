import { Module } from '@nestjs/common';
import { SupabaseJwtAuthGuard } from './supabase-jwt-auth.guard';

@Module({
  providers: [SupabaseJwtAuthGuard],
  exports: [SupabaseJwtAuthGuard]
})
export class AuthModule {}
