import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UnauthorizedException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

const stubIntegrations = (lookup: any = null) => ({ findTenantByWechatAppId: vi.fn().mockResolvedValue(lookup) }) as any;
const stubGroups = (groupId = 'g1') => ({ ensureDefault: vi.fn().mockResolvedValue({ id: groupId }) }) as any;

const makeService = (user: any, integrations = stubIntegrations(), groups = stubGroups()) => {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
  const jwt = new JwtService({ secret: 'test' });
  return new AuthService(prisma, jwt, integrations, groups);
};

beforeEach(() => { process.env.JWT_SECRET = 'test'; process.env.JWT_REFRESH_SECRET = 'test'; });

describe('AuthService.login', () => {
  it('密码正确且 active 时返回 token 对', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: 'a1', status: 'active', passwordHash: hash });
    const res = await svc.login({ username: 'merchantA', password: 'password123' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('密码错误时抛 Unauthorized', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', passwordHash: hash });
    await expect(svc.login({ username: 'x', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户不存在时抛 Unauthorized', async () => {
    const svc = makeService(null);
    await expect(svc.login({ username: 'none', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('status 非 active(待审核)时抛 Forbidden', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'pending', passwordHash: hash });
    await expect(svc.login({ username: 'p', password: 'password123' })).rejects.toBeInstanceOf(ForbiddenException);
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

describe('AuthService.loginWechat', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('未配置微信(appId 反查失败)抛 Unauthorized', async () => {
    const { svc } = makeWechatService({ lookup: null });
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('微信返回 errcode 抛 Unauthorized', async () => {
    vi.stubGlobal('fetch', wxFetch({ errcode: 40029, errmsg: 'invalid code' }));
    const { svc } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });
    await expect(svc.loginWechat({ code: 'bad', appId: 'wxX' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('active 用户命中直接签发,不建号', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'OPENID123' }));
    const { svc, prisma } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: { id: 'u9', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'OPENID123' },
    });
    const res = await svc.loginWechat({ code: 'c', appId: 'wxX' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('未注册 openid 抛 NotFound(引导去注册),绝不自动建号', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'NEWOPENID' }));
    const { svc, prisma } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('待审核(pending)用户登录抛 Forbidden', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'PENDOPENID' }));
    const { svc } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: { id: 'u8', tenantId: 't1', role: 'merchant', agentId: null, status: 'pending', wxOpenid: 'PENDOPENID' },
    });
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthService.registerWechat', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('未配置微信抛 Unauthorized', async () => {
    const { svc } = makeWechatService({ lookup: null });
    await expect(svc.registerWechat({ appId: 'wxX', code: 'c', displayName: '张三' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('新用户建为 pending/merchant/默认组,返回 pending 且不发 token', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'REGOPENID' }));
    const { svc, created, groups } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });
    const res = await svc.registerWechat({ appId: 'wxX', code: 'c', displayName: '李四', phone: '13800001111' });
    expect(res).toEqual({ status: 'pending' });
    expect((res as any).accessToken).toBeUndefined();
    expect(groups.ensureDefault).toHaveBeenCalledWith('t1');
    expect(created).toHaveLength(1);
    expect(created[0].role).toBe('merchant');
    expect(created[0].status).toBe('pending');
    expect(created[0].wxOpenid).toBe('REGOPENID');
    expect(created[0].displayName).toBe('李四');
    expect(created[0].phone).toBe('13800001111');
    expect(created[0].groupId).toBe('gDefault');
    expect(created[0].tenantId).toBe('t1');
  });

  it('openid 已注册抛 Conflict', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'DUPOPENID' }));
    const { svc, prisma } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: { id: 'u1', tenantId: 't1', wxOpenid: 'DUPOPENID', status: 'active' },
    });
    await expect(svc.registerWechat({ appId: 'wxX', code: 'c', displayName: '王五' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
