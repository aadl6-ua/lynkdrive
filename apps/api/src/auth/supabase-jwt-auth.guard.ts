import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException
} from '@nestjs/common';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  JWTPayload,
  JWTVerifyOptions
} from 'jose';
import { DataSource } from 'typeorm';
import { AuthUser } from './auth-user.type';

const SYMMETRIC_ALGORITHMS = ['HS256'];
const ASYMMETRIC_ALGORITHMS = ['ES256', 'RS256'];
// Cache corto del estado de bloqueo para no consultar la BD en cada petición.
// Es de módulo porque Nest puede crear una instancia del guard por controlador.
const BLOCK_CACHE_TTL_MS = 30_000;
const blockCache = new Map<string, { blocked: boolean; expiresAt: number }>();

/** Invalida la cache de bloqueo de un usuario (se llama al bloquear/desbloquear). */
export function forgetBlockStatus(userId: string): void {
  blockCache.delete(userId);
}

type RequestWithAuthUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

@Injectable()
export class SupabaseJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtAuthGuard.name);
  private readonly supabaseUrl = process.env.SUPABASE_URL;
  private readonly supabaseJwksUrl = process.env.SUPABASE_JWKS_URL;
  private readonly supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  private readonly jwtAudience = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
  private readonly jwtIssuer = this.supabaseUrl ? `${this.supabaseUrl}/auth/v1` : undefined;
  private readonly jwks = this.supabaseJwksUrl
    ? createRemoteJWKSet(new URL(this.supabaseJwksUrl))
    : null;

  // DataSource opcional: sin BD (tests unitarios) no se comprueba el bloqueo.
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const payload = await this.verifyToken(token);

    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;

    if (!sub) {
      throw new UnauthorizedException('Token subject (sub) is missing');
    }

    request.user = {
      sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      claims: payload as Record<string, unknown>
    };

    if (await this.isBlocked(sub)) {
      throw new ForbiddenException('Cuenta bloqueada por la administración');
    }

    return true;
  }

  private async isBlocked(userId: string): Promise<boolean> {
    if (!this.dataSource) {
      return false;
    }

    const cached = blockCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.blocked;
    }

    const rows = await this.dataSource.query(`SELECT blocked_at FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const blocked = Boolean((rows[0] as { blocked_at: Date | null } | undefined)?.blocked_at);
    blockCache.set(userId, { blocked, expiresAt: Date.now() + BLOCK_CACHE_TTL_MS });

    return blocked;
  }

  private extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
    if (!authorizationHeader || Array.isArray(authorizationHeader)) {
      return null;
    }

    const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
      return null;
    }

    return token;
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    if (!this.jwtIssuer) {
      this.logger.error('SUPABASE_URL no configurada: no se puede validar el issuer del token');
      throw new UnauthorizedException('Invalid or expired token');
    }

    try {
      const baseOptions: JWTVerifyOptions = {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        requiredClaims: ['exp', 'sub']
      };

      const algorithm = decodeProtectedHeader(token).alg;

      if (
        algorithm?.startsWith('HS') &&
        this.supabaseJwtSecret &&
        this.supabaseJwtSecret !== '<SUPABASE_JWT_SECRET_OPTIONAL>'
      ) {
        const secret = new TextEncoder().encode(this.supabaseJwtSecret);
        const { payload } = await jwtVerify(token, secret, {
          ...baseOptions,
          algorithms: SYMMETRIC_ALGORITHMS
        });

        return payload;
      }

      if (!this.jwks) {
        throw new UnauthorizedException('SUPABASE_JWKS_URL is required for asymmetric token verification');
      }

      const { payload } = await jwtVerify(token, this.jwks, {
        ...baseOptions,
        algorithms: ASYMMETRIC_ALGORITHMS
      });

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
