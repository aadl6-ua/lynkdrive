import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from 'src/auth/auth-user.type';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { SupabaseJwtAuthGuard } from 'src/auth/supabase-jwt-auth.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushNotificationsService } from './push-notifications.service';

@UseGuards(SupabaseJwtAuthGuard)
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly pushNotifications: PushNotificationsService) {}

  @Post()
  @HttpCode(204)
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushTokenDto): Promise<void> {
    await this.pushNotifications.registerToken(user.sub, dto.token, dto.platform);
  }

  @Delete(':token')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<void> {
    await this.pushNotifications.removeToken(user.sub, token);
  }
}
