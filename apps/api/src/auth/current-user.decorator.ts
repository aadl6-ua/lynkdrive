import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthUser } from './auth-user.type';

type RequestWithUser = {
  user?: AuthUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new UnauthorizedException('Authenticated user not found in request context');
    }

    return request.user;
  }
);
