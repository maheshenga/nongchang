import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '@nongchang/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }
  async validate(payload: AuthUser & { sub: string }): Promise<AuthUser> {
    return {
      userId: payload.userId, tenantId: payload.tenantId, role: payload.role,
      agentId: payload.agentId ?? null, ownerId: payload.ownerId ?? null,
    };
  }
}
