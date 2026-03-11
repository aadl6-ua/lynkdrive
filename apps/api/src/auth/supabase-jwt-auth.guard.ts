import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  JWTPayload,
  JWTVerifyOptions
} from 'jose';
import { AuthUser } from './auth-user.type';

type RequestWithAuthUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

@Injectable()
export class SupabaseJwtAuthGuard implements CanActivate {
  private readonly supabaseUrl = process.env.SUPABASE_URL;
  private readonly supabaseJwksUrl = process.env.SUPABASE_JWKS_URL;
  private readonly supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  private readonly jwtAudience = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
  private readonly jwtIssuer = this.supabaseUrl ? `${this.supabaseUrl}/auth/v1` : undefined;
  private readonly jwks = this.supabaseJwksUrl
    ? createRemoteJWKSet(new URL(this.supabaseJwksUrl))
    : null;

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

    return true;
  }

  private extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
    if (!authorizationHeader || Array.isArray(authorizationHeader)) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const verifyOptions: JWTVerifyOptions = {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience
      };

      const algorithm = decodeProtectedHeader(token).alg;

      if (
        algorithm?.startsWith('HS') &&
        this.supabaseJwtSecret &&
        this.supabaseJwtSecret !== '<SUPABASE_JWT_SECRET_OPTIONAL>'
      ) {
        const secret = new TextEncoder().encode(this.supabaseJwtSecret);
        const { payload } = await jwtVerify(token, secret, verifyOptions);

        return payload;
      }

      if (!this.jwks) {
        throw new UnauthorizedException('SUPABASE_JWKS_URL is required for asymmetric token verification');
      }

      const { payload } = await jwtVerify(token, this.jwks, verifyOptions);

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
