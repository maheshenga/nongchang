import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, Role } from '@nongchang/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }
  async validate(payload: AuthUser & { sub?: string }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: { select: { status: true } } },
    });
    const tokenVersion = payload.sessionVersion ?? 0;
    if (
      !user ||
      user.status !== 'active' ||
      user.tenant.status !== 'active' ||
      (user.sessionVersion ?? 0) !== tokenVersion
    ) {
      throw new UnauthorizedException('登录状态已失效');
    }

    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new UnauthorizedException('登录状态已失效');
      const agent = await this.prisma.agent.findFirst({
        where: { id: user.agentId, tenantId: user.tenantId },
        select: { id: true, status: true },
      });
      if (!agent || agent.status !== 'active') throw new UnauthorizedException('登录状态已失效');
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      agentId: user.agentId ?? null,
      ownerId: user.role === Role.MERCHANT ? user.id : null,
      sessionVersion: user.sessionVersion ?? 0,
    };
  }
}
