import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, type AuthUser, type CloseAccountInput } from '@nongchang/shared';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { SessionValidationCacheService } from '../../auth/session-validation-cache.service';
import { WechatIdentityService } from '../../auth/wechat-identity.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatIdentityService,
    private readonly sessions: SessionValidationCacheService,
  ) {}

  async close(actor: AuthUser, input: CloseAccountInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, tenantId: actor.tenantId, status: 'active' },
      select: {
        id: true,
        tenantId: true,
        role: true,
        agentId: true,
        passwordHash: true,
        wxOpenid: true,
      },
    });
    if (!user) throw new UnauthorizedException('账号不存在或状态已变化');
    if (user.role !== Role.MERCHANT && user.role !== Role.MEMBER) {
      throw new ForbiddenException('管理员账号不能自助注销，请先完成职责移交');
    }

    const verificationMethod = user.wxOpenid ? 'wechat' : 'password';
    if (input.method !== verificationMethod) {
      throw new BadRequestException('注销验证方式与账号不匹配');
    }
    if (input.method === 'password') {
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new UnauthorizedException('当前密码错误');
    } else {
      const identity = await this.wechat.resolve(input.appId, input.code);
      if (identity.tenantId !== actor.tenantId || identity.openid !== user.wxOpenid) {
        throw new UnauthorizedException('微信身份验证失败');
      }
    }

    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    await this.prisma.$transaction(async transaction => {
      const updated = await transaction.user.updateMany({
        where: {
          id: actor.userId,
          tenantId: actor.tenantId,
          status: 'active',
          wxOpenid: user.wxOpenid,
        },
        data: {
          status: 'deleted',
          username: `deleted_${actor.userId}`,
          displayName: '已注销用户',
          phone: null,
          wxOpenid: null,
          groupId: null,
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('账号状态已变化，请重新登录后重试');
      }
    });
    await this.sessions.invalidateUser(actor.tenantId, actor.userId);
  }
}
