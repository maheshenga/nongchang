import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, type AuthUser, type CloseAccountInput } from '@nongchang/shared';
import * as bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountLifecycleService } from './account-lifecycle.service';

const actor: AuthUser = {
  userId: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'u1',
};
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('password123', 4);
});

function makeService(overrides: Partial<{
  user: Record<string, unknown> | null;
  updated: number;
  identity: { tenantId: string; openid: string };
}> = {}) {
  const user = overrides.user === undefined ? {
    id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
    status: 'active', passwordHash, wxOpenid: null,
  } : overrides.user;
  const transaction = {
    user: { updateMany: vi.fn().mockResolvedValue({ count: overrides.updated ?? 1 }) },
  };
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user) },
    $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
  };
  const wechat = {
    resolve: vi.fn().mockResolvedValue(overrides.identity ?? { tenantId: 't1', openid: 'openid-1' }),
  };
  const sessions = { invalidateUser: vi.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    transaction,
    wechat,
    sessions,
    service: new AccountLifecycleService(prisma as never, wechat as never, sessions as never),
  };
}

const passwordInput: CloseAccountInput = {
  method: 'password', currentPassword: 'password123', confirmation: '注销账号',
};
const wechatInput: CloseAccountInput = {
  method: 'wechat', appId: 'wx-example', code: 'fresh-code', confirmation: '注销账号',
};

describe('AccountLifecycleService', () => {
  it('strongly verifies a password account, anonymizes it atomically, and invalidates sessions', async () => {
    const { prisma, transaction, sessions, service } = makeService();

    await expect(service.close(actor, passwordInput)).resolves.toBeUndefined();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', tenantId: 't1', status: 'active' },
      select: {
        id: true, tenantId: true, role: true, agentId: true,
        passwordHash: true, wxOpenid: true,
      },
    });
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'u1', tenantId: 't1', status: 'active', wxOpenid: null,
      },
      data: {
        status: 'deleted',
        username: 'deleted_u1',
        displayName: '已注销用户',
        phone: null,
        wxOpenid: null,
        groupId: null,
        passwordHash: expect.any(String),
        sessionVersion: { increment: 1 },
      },
    });
    const updateData = transaction.user.updateMany.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('tenantId');
    expect(updateData).not.toHaveProperty('role');
    expect(updateData).not.toHaveProperty('agentId');
    expect(sessions.invalidateUser).toHaveBeenCalledWith('t1', 'u1');
  });

  it('rejects an invalid password before starting a mutation', async () => {
    const { prisma, sessions, service } = makeService();

    await expect(service.close(actor, { ...passwordInput, currentPassword: 'wrong-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sessions.invalidateUser).not.toHaveBeenCalled();
  });

  it('requires the server-derived verification method', async () => {
    const passwordAccount = makeService();
    await expect(passwordAccount.service.close(actor, wechatInput))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(passwordAccount.wechat.resolve).not.toHaveBeenCalled();

    const wechatAccount = makeService({ user: {
      id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
      status: 'active', passwordHash, wxOpenid: 'openid-1',
    } });
    await expect(wechatAccount.service.close(actor, passwordInput))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(wechatAccount.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('matches both tenant and OpenID for fresh WeChat verification', async () => {
    const { transaction, wechat, sessions, service } = makeService({ user: {
      id: 'u1', tenantId: 't1', role: Role.MEMBER, agentId: null,
      status: 'active', passwordHash, wxOpenid: 'openid-1',
    } });

    await service.close({ ...actor, role: Role.MEMBER }, wechatInput);

    expect(wechat.resolve).toHaveBeenCalledWith('wx-example', 'fresh-code');
    expect(transaction.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', tenantId: 't1', status: 'active', wxOpenid: 'openid-1' },
    }));
    expect(sessions.invalidateUser).toHaveBeenCalledWith('t1', 'u1');
  });

  it.each([
    [{ tenantId: 'other-tenant', openid: 'openid-1' }, 'cross-tenant identity'],
    [{ tenantId: 't1', openid: 'other-openid' }, 'different OpenID'],
  ])('rejects WeChat mismatch: %s', async (identity) => {
    const { prisma, service } = makeService({
      user: {
        id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
        status: 'active', passwordHash, wxOpenid: 'openid-1',
      },
      identity,
    });

    await expect(service.close(actor, wechatInput)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN])(
    'rejects administrator self-closure for %s',
    async role => {
      const { prisma, service } = makeService({ user: {
        id: 'u1', tenantId: 't1', role, agentId: role === Role.AGENT_ADMIN ? 'agent-1' : null,
        status: 'active', passwordHash, wxOpenid: null,
      } });

      await expect(service.close({ ...actor, role }, passwordInput))
        .rejects.toEqual(expect.objectContaining({
          message: '管理员账号不能自助注销，请先完成职责移交',
        } satisfies Partial<ForbiddenException>));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a concurrent status change and keeps the cache untouched', async () => {
    const { sessions, service } = makeService({ updated: 0 });

    await expect(service.close(actor, passwordInput)).rejects.toEqual(expect.objectContaining({
      message: '账号状态已变化，请重新登录后重试',
    } satisfies Partial<ConflictException>));
    expect(sessions.invalidateUser).not.toHaveBeenCalled();
  });

  it('rejects a missing or inactive account before verification', async () => {
    const { prisma, service } = makeService({ user: null });

    await expect(service.close(actor, passwordInput)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
