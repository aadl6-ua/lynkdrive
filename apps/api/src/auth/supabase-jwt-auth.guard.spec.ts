import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { SupabaseJwtAuthGuard } from './supabase-jwt-auth.guard';

const SECRET = 'test-secret-with-enough-length-1234567890';
const SUPABASE_URL = 'http://supabase.test';
const ORIGINAL_ENV = { ...process.env };

function contextFor(headers: Record<string, string | undefined>) {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;

  return { context, request };
}

async function sign(claims: Record<string, unknown>, options: { issuer?: string; audience?: string; secret?: string; exp?: string } = {}) {
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setAudience(options.audience ?? 'authenticated')
    .setExpirationTime(options.exp ?? '1h');

  if (typeof claims.sub === 'string') {
    jwt = jwt.setSubject(claims.sub);
  }

  return jwt.sign(new TextEncoder().encode(options.secret ?? SECRET));
}

describe('SupabaseJwtAuthGuard', () => {
  let guard: SupabaseJwtAuthGuard;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL,
      SUPABASE_JWT_SECRET: SECRET
    };
    delete process.env.SUPABASE_JWKS_URL;
    delete process.env.SUPABASE_JWT_AUDIENCE;
    guard = new SupabaseJwtAuthGuard();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('acepta un token HS256 valido y expone el usuario en la request', async () => {
    const token = await sign({ sub: 'user-1', email: 'a@b.c', role: 'authenticated' });
    const { context, request } = contextFor({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'user-1', email: 'a@b.c', role: 'authenticated' });
  });

  it.each([undefined, 'Basic abc', 'Bearer'])('rechaza cabecera Authorization %p', async (authorization) => {
    const { context } = contextFor({ authorization });
    await expect(guard.canActivate(context)).rejects.toThrow('Missing Bearer token');
  });

  it('rechaza tokens firmados con otro secreto', async () => {
    const token = await sign({ sub: 'user-1' }, { secret: 'otro-secreto-distinto-1234567890abcdef' });
    const { context } = contextFor({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza tokens con audience o issuer incorrectos', async () => {
    const wrongAudience = await sign({ sub: 'user-1' }, { audience: 'anon' });
    const wrongIssuer = await sign({ sub: 'user-1' }, { issuer: 'http://evil/auth/v1' });

    await expect(guard.canActivate(contextFor({ authorization: `Bearer ${wrongAudience}` }).context)).rejects.toThrow(
      'Invalid or expired token'
    );
    await expect(guard.canActivate(contextFor({ authorization: `Bearer ${wrongIssuer}` }).context)).rejects.toThrow(
      'Invalid or expired token'
    );
  });

  it('rechaza tokens expirados', async () => {
    const token = await sign({ sub: 'user-1' }, { exp: '-1m' });
    await expect(guard.canActivate(contextFor({ authorization: `Bearer ${token}` }).context)).rejects.toThrow(
      'Invalid or expired token'
    );
  });

  it('rechaza tokens sin sub', async () => {
    const token = await sign({ email: 'a@b.c' });
    await expect(guard.canActivate(contextFor({ authorization: `Bearer ${token}` }).context)).rejects.toThrow(
      'Token subject (sub) is missing'
    );
  });
});
