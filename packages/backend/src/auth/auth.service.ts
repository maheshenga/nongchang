import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginDto, TokenPair, AuthUser, Role } from '@nongchang/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const authUser: AuthUser = {
      userId: user.id, tenantId: user.tenantId, role: user.role as Role,
      agentId: user.agentId ?? null,
      ownerId: user.role === Role.MERCHANT ? user.id : null,
    };
    return this.issueTokens(authUser);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const authUser: AuthUser = {
        userId: payload.userId, tenantId: payload.tenantId, role: payload.role,
        agentId: payload.agentId ?? null, ownerId: payload.ownerId ?? null,
      };
      return this.issueTokens(authUser);
    } catch {
      throw new UnauthorizedException('刷新令牌无效');
    }
  }

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(user, {
      secret: process.env.JWT_SECRET, expiresIn: '2h',
    });
    const refreshToken = await this.jwt.signAsync(user, {
      secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d',
    });
    return { accessToken, refreshToken };
  }
}
