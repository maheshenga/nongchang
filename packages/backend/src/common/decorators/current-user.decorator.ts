import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@nongchang/shared';
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
