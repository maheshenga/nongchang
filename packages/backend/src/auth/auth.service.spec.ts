import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

const stubIntegrations = (lookup: any = null) => ({ findTenantByWechatAppId: vi.fn().mockResolvedValue(lookup) }) as any;
const stubGroups = (groupId = 'g1') => ({ ensureDefault: vi.fn().mockResolvedValue({ id: groupId }) }) as any;

const makeService = (user: any, integrations = stubIntegrations(), groups = stubGroups()) => {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
  const jwt = new JwtService({ secret: 'test' });
  return new AuthService(prisma, jwt, integrations, groups);
};

beforeEach(() => { process.env.JWT_SECRET = 'test'; process.env.JWT_REFRESH_SECRET = 'test'; });

describe('AuthService.login', () => {
  it('密码正确时返回 token 对', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: 'a1', passwordHash: hash });
    const res = await svc.login({ username: 'merchantA', password: 'password123' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('密码错误时抛 Unauthorized', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, passwordHash: hash });
    await expect(svc.login({ username: 'x', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户不存在时抛 Unauthorized', async () => {
    const svc = makeService(null);
    await expect(svc.login({ username: 'none', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.refresh', () => {
  it('有效 refresh token 重新签发 token 对', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const prisma = { user: { findUnique: vi.fn() } } as any;
    const svc = new AuthService(prisma, jwt, stubIntegrations(), stubGroups());
    const rt = await jwt.signAsync(
      { userId: 'u1', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'u1' },
      { secret: 'test', expiresIn: '7d' },
    );
    const res = await svc.refresh(rt);
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('无效 refresh token 抛 Unauthorized', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const svc = new AuthService({ user: { findUnique: vi.fn() } } as any, jwt, stubIntegrations(), stubGroups());
    await expect(svc.refresh('garbage.token.value')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.loginWechat', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const wxFetch = (body: any) => vi.fn().mockResolvedValue({ json: async () => body });

  function makeWechatService(opts: { lookup?: any; existingUser?: any }) {
    const jwt = new JwtService({ secret: 'test' });
    const created: any[] = [];
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(opts.existingUser ?? null),
        create: vi.fn().mockImplementation(async ({ data }: any) => { const u = { id: 'newu', ...data }; created.push(u); return u; }),
      },
    } as any;
    const integrations = stubIntegrations(opts.lookup ?? null);
    const groups = stubGroups('gDefault');
    const svc = new AuthService(prisma, jwt, integrations, groups);
    return { svc, prisma, integrations, groups, created };
  }

  it('未配置微信(appId 反查失败)抛 Unauthorized', async () => {
    const { svc } = makeWechatService({ lookup: null });
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('微信返回 errcode 抛 Unauthorized', async () => {
    vi.stubGlobal('fetch', wxFetch({ errcode: 40029, errmsg: 'invalid code' }));
    const { svc } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });
    await expect(svc.loginWechat({ code: 'bad', appId: 'wxX' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('已绑定 openid 命中直接签发', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'OPENID123' }));
    const { svc, prisma } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: { id: 'u9', tenantId: 't1', role: 'merchant', agentId: null, wxOpenid: 'OPENID123' },
    });
    const res = await svc.loginWechat({ code: 'c', appId: 'wxX' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('新 openid 自动注册进默认组(merchant 角色)', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'NEWOPENID' }));
    const { svc, created, groups } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });
    const res = await svc.loginWechat({ code: 'c', appId: 'wxX' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(groups.ensureDefault).toHaveBeenCalledWith('t1');
    expect(created).toHaveLength(1);
    expect(created[0].role).toBe('merchant');
    expect(created[0].wxOpenid).toBe('NEWOPENID');
    expect(created[0].groupId).toBe('gDefault');
    expect(created[0].tenantId).toBe('t1');
  });
});
