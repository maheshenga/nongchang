import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { LoginDto, TokenPair, AuthUser, Role, WechatLoginDto } from '@nongchang/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationConfigService } from '../modules/integration/integration-config.service';
import { UserGroupService } from '../modules/user-group/user-group.service';

const WX_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const WX_TIMEOUT_MS = 8000;

interface WxSessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private integrations: IntegrationConfigService,
    private groups: UserGroupService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const roles = Object.values(Role) as string[];
    if (!roles.includes(user.role)) throw new UnauthorizedException('账号角色无效');

    return this.issueTokens(this.toAuthUser(user));
  }

  async loginWechat(dto: WechatLoginDto): Promise<TokenPair> {
    // 1. 用 appId 全局反查租户 + 解密 secret(仅启用的微信配置)
    const lookup = await this.integrations.findTenantByWechatAppId(dto.appId);
    if (!lookup) throw new UnauthorizedException('该小程序未配置微信登录');

    // 2. code 换 openid
    const openid = await this.exchangeWxCode(dto.appId, lookup.secret, dto.code);

    // 3. 按 (tenantId, wxOpenid) 查用户;无则自动注册进默认组
    let user = await this.prisma.user.findFirst({
      where: { tenantId: lookup.tenantId, wxOpenid: openid },
    });
    if (!user) {
      user = await this.registerWechatUser(lookup.tenantId, openid);
    }
    return this.issueTokens(this.toAuthUser(user));
  }

  private async exchangeWxCode(appId: string, secret: string, code: string): Promise<string> {
    const url = `${WX_SESSION_URL}?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WX_TIMEOUT_MS);
    let data: WxSessionResponse;
    try {
      const res = await fetch(url, { signal: controller.signal });
      data = (await res.json()) as WxSessionResponse;
    } catch {
      throw new UnauthorizedException('微信登录服务不可用');
    } finally {
      clearTimeout(timer);
    }
    if (data.errcode || !data.openid) {
      throw new UnauthorizedException('微信登录失败');
    }
    return data.openid;
  }

  private async registerWechatUser(tenantId: string, openid: string) {
    const group = await this.groups.ensureDefault(tenantId);
    // 随机密码哈希,禁止该账号走密码登录
    const randomHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const username = `wx_${openid.slice(0, 12)}_${randomBytes(3).toString('hex')}`;
    return this.prisma.user.create({
      data: {
        tenantId,
        role: Role.MERCHANT,
        username,
        passwordHash: randomHash,
        wxOpenid: openid,
        displayName: '微信用户',
        groupId: group.id,
      },
    });
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

  private toAuthUser(user: { id: string; tenantId: string; role: string; agentId: string | null }): AuthUser {
    return {
      userId: user.id, tenantId: user.tenantId, role: user.role as Role,
      agentId: user.agentId ?? null,
      ownerId: user.role === Role.MERCHANT ? user.id : null,
    };
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
