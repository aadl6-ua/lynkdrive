import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthUser } from './auth-user.type';
import { SupabaseJwtAuthGuard } from './supabase-jwt-auth.guard';

type RequestWithAuthUser = {
  user?: AuthUser;
};

/**
 * Valida el JWT de Supabase (mismo guard que el resto de la API) y exige que el usuario
 * tenga `users.is_admin = true`, no esté borrado ni bloqueado. El rol se lee siempre de la
 * BD: no se confía en claims del token para conceder privilegios.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: SupabaseJwtAuthGuard,
    private readonly dataSource: DataSource
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtGuard.canActivate(context);

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const userId = request.user?.sub;

    if (!userId) {
      throw new ForbiddenException('Acceso restringido a administradores');
    }

    const rows = await this.dataSource.query(
      `SELECT is_admin FROM users WHERE id = $1 AND deleted_at IS NULL AND blocked_at IS NULL LIMIT 1`,
      [userId]
    );

    if ((rows[0] as { is_admin: boolean } | undefined)?.is_admin !== true) {
      throw new ForbiddenException('Acceso restringido a administradores');
    }

    return true;
  }
}
