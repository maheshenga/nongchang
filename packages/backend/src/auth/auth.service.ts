import { Injectable, UnauthorizedException, NotFoundException, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { LoginDto, TokenPair, AuthUser, Role, WechatLoginDto, WechatRegisterDto, WechatRegisterResponse, WechatRegistrationStatusResponse, MeProfileView, UpdateMeDto, ChangePasswordDto, MiniappLoginDto, MiniappWechatLoginDto, MiniappWechatRegisterDto } from '@nongchang/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UserGroupService } from '../modules/user-group/user-group.service';
import { LegalService } from '../modules/legal/legal.service';
import { canRefreshSession, isKnownRole, toAuthUser } from './auth.model';
import { SessionValidationCacheService } from './session-validation-cache.service';
import { WechatIdentityService } from './wechat-identity.service';

interface MeProfileRow {
  id: string;
  tenantId: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
  phone: string | null;
  status: string;
  wxOpenid: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private wechat: WechatIdentityService,
    private groups: UserGroupService,
    private legal: LegalService,
    @Optional() private sessions?: SessionValidationCacheService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    return this.issueTokens(toAuthUser(await this.authenticatePassword(dto)));
  }

  async loginMiniapp(dto: MiniappLoginDto): Promise<TokenPair> {
    const user = await this.authenticatePassword(dto);
    await this.legal.recordConsent({
      tenantId: user.tenantId,
      userId: user.id,
      publicationId: dto.publicationId,
    });
    return this.issueTokens(toAuthUser(user));
  }

  private async authenticatePassword(dto: LoginDto) {
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

    if (!isKnownRole(user.role)) throw new UnauthorizedException('账号角色无效');
    if (user.status !== 'active') throw new ForbiddenException('账号待审核或已停用');
    if (tenant.status !== 'active') throw new ForbiddenException('所属机构已停用');
    await this.assertActiveAgent(user);
    return user;
  }

  async loginWechat(dto: WechatLoginDto): Promise<TokenPair> {
    return this.issueTokens(toAuthUser(await this.authenticateWechat(dto)));
  }

  async loginWechatMiniapp(dto: MiniappWechatLoginDto): Promise<TokenPair> {
    const user = await this.authenticateWechat(dto);
    await this.legal.recordConsent({
      tenantId: user.tenantId,
      userId: user.id,
      publicationId: dto.publicationId,
    });
    return this.issueTokens(toAuthUser(user));
  }

  private async authenticateWechat(dto: WechatLoginDto) {
    const identity = await this.wechat.resolve(dto.appId, dto.code);
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_wxOpenid: {
          tenantId: identity.tenantId,
          wxOpenid: identity.openid,
        },
      },
      include: { tenant: { select: { status: true } } },
    });
    if (!user) throw new NotFoundException('账号未注册');
    if (user.status !== 'active') throw new ForbiddenException('账号审核中');
    if (user.tenant.status !== 'active') throw new ForbiddenException('所属机构已停用');
    await this.assertActiveAgent(user);
    return user;
  }

  async registerWechat(dto: WechatRegisterDto): Promise<WechatRegisterResponse> {
    const identity = await this.wechat.resolve(dto.appId, dto.code);

    const existing = await this.prisma.user.findUnique({
      where: {
        tenantId_wxOpenid: {
          tenantId: identity.tenantId,
          wxOpenid: identity.openid,
        },
      },
    });
    if (existing) throw new ConflictException('该微信已注册');

    const group = await this.groups.ensureDefault(identity.tenantId);
    // 随机密码哈希,禁止该账号走密码登录
    const randomHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const username = `wx_${identity.openid.slice(0, 12)}_${randomBytes(3).toString('hex')}`;
    const created = await this.prisma.user.create({
      data: {
        tenantId: identity.tenantId,
        role: Role.MERCHANT,
        username,
        passwordHash: randomHash,
        wxOpenid: identity.openid,
        displayName: dto.displayName,
        phone: dto.phone,
        status: 'pending',
        groupId: group.id,
      },
      select: { id: true },
    });
    return { applicationId: created.id, status: 'pending' };
  }

  async registerWechatMiniapp(
    dto: MiniappWechatRegisterDto,
  ): Promise<WechatRegisterResponse> {
    const identity = await this.wechat.resolve(dto.appId, dto.code);
    const existing = await this.prisma.user.findUnique({
      where: {
        tenantId_wxOpenid: {
          tenantId: identity.tenantId,
          wxOpenid: identity.openid,
        },
      },
    });
    if (existing) throw new ConflictException('该微信已注册');

    const group = await this.groups.ensureDefault(identity.tenantId);
    const randomHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const username = `wx_${identity.openid.slice(0, 12)}_${randomBytes(3).toString('hex')}`;

    return this.prisma.$transaction(async tx => {
      const publication = await this.legal.requireCurrentPublication(
        identity.tenantId,
        dto.publicationId,
        tx,
      );
      const created = await tx.user.create({
        data: {
          tenantId: identity.tenantId,
          role: Role.MERCHANT,
          username,
          passwordHash: randomHash,
          wxOpenid: identity.openid,
          displayName: dto.displayName,
          phone: dto.phone,
          status: 'pending',
          groupId: group.id,
        },
        select: { id: true },
      });
      await this.legal.createConsent(tx, {
        tenantId: identity.tenantId,
        userId: created.id,
        publication,
      });
      return { applicationId: created.id, status: 'pending' as const };
    });
  }

  async getWechatRegistrationStatus(dto: WechatLoginDto): Promise<WechatRegistrationStatusResponse> {
    const identity = await this.wechat.resolve(dto.appId, dto.code);
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_wxOpenid: {
          tenantId: identity.tenantId,
          wxOpenid: identity.openid,
        },
      },
      select: { id: true, displayName: true, status: true },
    });
    if (!user) throw new NotFoundException('未找到入驻申请');

    const status = user.status === 'pending'
      ? 'pending'
      : user.status === 'active'
        ? 'approved'
        : 'rejected_or_suspended';
    return {
      applicationId: user.id,
      displayName: user.displayName,
      status,
      updatedAt: null,
    };
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
    const tokenVersion = payload.sessionVersion ?? 0;
    if (!canRefreshSession(user, tokenVersion)) {
      throw new UnauthorizedException('刷新令牌无效');
    }
    await this.assertActiveAgent(user);
    return this.issueTokens(toAuthUser(user));
  }

  // ── 个人账号(/auth/me)── 任意已登录角色自助查看/维护本人资料。
  // 始终以 DB 最新数据为准,绝不回传 passwordHash / wxOpenid。
  async getMe(actor: AuthUser): Promise<MeProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, tenantId: true, username: true, role: true, agentId: true, displayName: true, phone: true, status: true, wxOpenid: true },
    });
    if (!user) throw new UnauthorizedException('账号不存在');
    return this.toMeProfile(user);
  }

  async updateMe(actor: AuthUser, dto: UpdateMeDto): Promise<MeProfileView> {
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    const user = await this.prisma.user.update({
      where: { id: actor.userId }, data,
      select: { id: true, tenantId: true, username: true, role: true, agentId: true, displayName: true, phone: true, status: true, wxOpenid: true },
    });
    return this.toMeProfile(user);
  }

  private toMeProfile(user: MeProfileRow): MeProfileView {
    const { wxOpenid, ...profile } = user;
    return {
      ...profile,
      agentId: user.agentId,
      phone: user.phone,
      deletionVerification: wxOpenid ? 'wechat' : 'password',
    };
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, passwordHash: true } });
    if (!user) throw new UnauthorizedException('账号不存在');
    const ok = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('原密码错误');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: actor.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await this.sessions?.invalidateUser(actor.tenantId, actor.userId);
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

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(user, {
      secret: process.env.JWT_SECRET, expiresIn: '15m', jwtid: randomUUID(),
    });
    const refreshToken = await this.jwt.signAsync(user, {
      secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d', jwtid: randomUUID(),
    });
    return { accessToken, refreshToken };
  }
}
