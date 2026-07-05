import { Injectable, UnauthorizedException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { LoginDto, TokenPair, AuthUser, Role, WechatLoginDto, WechatRegisterDto, WechatRegisterResponse, MeProfileView, UpdateMeDto, ChangePasswordDto } from '@nongchang/shared';
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
    // username 仅租户内唯一,故先用机构编码(全局唯一)定位租户,再按 (tenantId, username) 复合键查用户。
    const tenant = await this.prisma.tenant.findUnique({
      where: { code: dto.tenantCode },
      select: { id: true, status: true },
    });
    if (!tenant) throw new UnauthorizedException('账号或密码错误');
    const user = await this.prisma.user.findUnique({
      where: { tenantId_username: { tenantId: tenant.id, username: dto.username } },
    });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const roles = Object.values(Role) as string[];
    if (!roles.includes(user.role)) throw new UnauthorizedException('账号角色无效');
    if (user.status !== 'active') throw new ForbiddenException('账号待审核或已停用');
    if (tenant.status !== 'active') throw new ForbiddenException('所属机构已停用');
    await this.assertActiveAgent(user);

    return this.issueTokens(this.toAuthUser(user));
  }

  async loginWechat(dto: WechatLoginDto): Promise<TokenPair> {
    // 1. 用 appId 全局反查租户 + 解密 secret(仅启用的微信配置)
    const lookup = await this.integrations.findTenantByWechatAppId(dto.appId);
    if (!lookup) throw new UnauthorizedException('该小程序未配置微信登录');

    // 2. code 换 openid
    const openid = await this.exchangeWxCode(dto.appId, lookup.secret, dto.code);

    // 3. 按 (tenantId, wxOpenid) 查用户;未注册→引导注册,待审核→拒绝
    const user = await this.prisma.user.findFirst({
      where: { tenantId: lookup.tenantId, wxOpenid: openid },
      include: { tenant: { select: { status: true } } },
    });
    if (!user) throw new NotFoundException('账号未注册');
    if (user.status !== 'active') throw new ForbiddenException('账号审核中');
    if (user.tenant.status !== 'active') throw new ForbiddenException('所属机构已停用');
    await this.assertActiveAgent(user);
    return this.issueTokens(this.toAuthUser(user));
  }

  async registerWechat(dto: WechatRegisterDto): Promise<WechatRegisterResponse> {
    const lookup = await this.integrations.findTenantByWechatAppId(dto.appId);
    if (!lookup) throw new UnauthorizedException('该小程序未配置微信登录');

    const openid = await this.exchangeWxCode(dto.appId, lookup.secret, dto.code);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: lookup.tenantId, wxOpenid: openid },
    });
    if (existing) throw new ConflictException('该微信已注册');

    const group = await this.groups.ensureDefault(lookup.tenantId);
    // 随机密码哈希,禁止该账号走密码登录
    const randomHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const username = `wx_${openid.slice(0, 12)}_${randomBytes(3).toString('hex')}`;
    await this.prisma.user.create({
      data: {
        tenantId: lookup.tenantId,
        role: Role.MERCHANT,
        username,
        passwordHash: randomHash,
        wxOpenid: openid,
        displayName: dto.displayName,
        phone: dto.phone,
        status: 'pending',
        groupId: group.id,
      },
    });
    return { status: 'pending' };
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

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('刷新令牌无效');
    }
    // 查库吊销 + 刷新:用户被停用/删除或租户停用则拒绝;
    // 命中则以 DB 最新 role/agentId/status 重建 AuthUser(角色/归属变更立即生效)。
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: { select: { status: true } } },
    });
    if (!user || user.status !== 'active' || user.tenant.status !== 'active') {
      throw new UnauthorizedException('刷新令牌无效');
    }
    await this.assertActiveAgent(user);
    return this.issueTokens(this.toAuthUser(user));
  }

  // ── 个人账号(/auth/me)── 任意已登录角色自助查看/维护本人资料。
  // 始终以 DB 最新数据为准,绝不回传 passwordHash / wxOpenid。
  async getMe(actor: AuthUser): Promise<MeProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, tenantId: true, username: true, role: true, agentId: true, displayName: true, phone: true, status: true },
    });
    if (!user) throw new UnauthorizedException('账号不存在');
    return { ...user, agentId: user.agentId ?? null, phone: user.phone ?? null };
  }

  async updateMe(actor: AuthUser, dto: UpdateMeDto): Promise<MeProfileView> {
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    const user = await this.prisma.user.update({
      where: { id: actor.userId }, data,
      select: { id: true, tenantId: true, username: true, role: true, agentId: true, displayName: true, phone: true, status: true },
    });
    return { ...user, agentId: user.agentId ?? null, phone: user.phone ?? null };
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
    if (!user) throw new UnauthorizedException('账号不存在');
    const ok = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('原密码错误');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: actor.userId }, data: { passwordHash } });
    return { ok: true };
  }

  private async assertActiveAgent(user: { tenantId: string; role: string; agentId: string | null }) {
    if (user.role !== Role.AGENT_ADMIN) return;
    if (!user.agentId) throw new ForbiddenException('Agent admin ownership is invalid');
    const agent = await this.prisma.agent.findFirst({
      where: { id: user.agentId, tenantId: user.tenantId },
      select: { status: true },
    });
    if (!agent || agent.status !== 'active') throw new ForbiddenException('Linked agent is suspended');
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
