import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { SupabaseJwtAuthGuard } from './supabase-jwt-auth.guard';

function contextFor(request: { user?: unknown }) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function buildGuard(options: { jwtOk?: boolean; rows?: unknown[] } = {}) {
  const jwtGuard = {
    canActivate: jest.fn(async (context: ExecutionContext) => {
      if (options.jwtOk === false) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      const request = context.switchToHttp().getRequest<{ user?: unknown }>();
      request.user = { sub: 'admin-1', claims: {} };
      return true;
    })
  };
  const dataSource = { query: jest.fn().mockResolvedValue(options.rows ?? []) };
  const guard = new AdminGuard(jwtGuard as unknown as SupabaseJwtAuthGuard, dataSource as never);

  return { guard, jwtGuard, dataSource };
}

describe('AdminGuard', () => {
  it('permite el acceso a un admin activo', async () => {
    const { guard, dataSource } = buildGuard({ rows: [{ is_admin: true }] });

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('blocked_at IS NULL'), ['admin-1']);
  });

  it('propaga el 401 del guard JWT sin consultar la BD', async () => {
    const { guard, dataSource } = buildGuard({ jwtOk: false });

    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it.each([
    ['usuario sin rol admin', [{ is_admin: false }]],
    ['usuario inexistente, borrado o bloqueado', []]
  ])('rechaza con 403 a %s', async (_label, rows) => {
    const { guard } = buildGuard({ rows });
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignora claims de rol del token: solo cuenta la BD', async () => {
    const { guard, jwtGuard } = buildGuard({ rows: [] });
    jwtGuard.canActivate.mockImplementationOnce(async (context: ExecutionContext) => {
      context.switchToHttp().getRequest<{ user?: unknown }>().user = {
        sub: 'user-2',
        role: 'admin',
        claims: { role: 'admin', is_admin: true }
      };
      return true;
    });

    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
