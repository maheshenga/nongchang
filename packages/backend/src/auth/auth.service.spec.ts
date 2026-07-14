import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { WechatIdentityService } from './wechat-identity.service';
import { UnauthorizedException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

const stubIntegrations = (lookup: any = null) => ({ findTenantByWechatAppId: vi.fn().mockResolvedValue(lookup) }) as any;
const stubWechat = (lookup: any = null) => new WechatIdentityService(stubIntegrations(lookup));
const stubGroups = (groupId = 'g1') => ({ ensureDefault: vi.fn().mockResolvedValue({ id: groupId }) }) as any;
const stubLegal = () => ({
  recordConsent: vi.fn().mockResolvedValue(undefined),
  requireCurrentPublication: vi.fn(),
  createConsent: vi.fn().mockResolvedValue(undefined),
}) as any;
const publicationId = '22222222-2222-4222-8222-222222222222';

const makeService = (user: any, wechat = stubWechat(), groups = stubGroups(), tenant: any = activeTenantRow) => {
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue(tenant) },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
  } as any;
  const jwt = new JwtService({ secret: 'test' });
  return new AuthService(prisma, jwt, wechat, groups, stubLegal());
};

// login 现在先用机构编码查租户(含 status),再按 (tenantId, username) 查用户。
const activeTenantRow = { id: 't1', status: 'active' };
// 默认带 active 租户;按需覆盖 tenant.status 测试机构停用。
const activeTenant = { status: 'active' };

beforeEach(() => { process.env.JWT_SECRET = 'test'; process.env.JWT_REFRESH_SECRET = 'test'; });

describe('AuthService.login', () => {
  it('密码正确且 active 时返回 token 对', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: 'a1', status: 'active', passwordHash: hash });
    const res = await svc.login({ tenantCode: 'DEMO', username: 'merchantA', password: 'password123' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('密码错误时抛 Unauthorized', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', passwordHash: hash });
    await expect(svc.login({ tenantCode: 'DEMO', username: 'x', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户不存在时抛 Unauthorized', async () => {
    const svc = makeService(null);
    await expect(svc.login({ tenantCode: 'DEMO', username: 'none', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('机构编码无效(租户不存在)时抛 Unauthorized', async () => {
    const svc = makeService({ id: 'u1' }, stubWechat(), stubGroups(), null);
    await expect(svc.login({ tenantCode: 'NOPE', username: 'x', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('status 非 active(待审核)时抛 Forbidden', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'pending', passwordHash: hash });
    await expect(svc.login({ tenantCode: 'DEMO', username: 'p', password: 'password123' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('所属租户停用时抛 Forbidden(#26)', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', passwordHash: hash }, stubWechat(), stubGroups(), { id: 't1', status: 'suspended' });
    await expect(svc.login({ tenantCode: 'DEMO', username: 'p', password: 'password123' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects password login when agent_admin linked agent is suspended', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(activeTenantRow) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u-agent',
          tenantId: 't1',
          role: 'agent_admin',
          agentId: 'a-suspended',
          status: 'active',
          passwordHash: hash,
        }),
      },
      agent: { findFirst: vi.fn().mockResolvedValue({ id: 'a-suspended', status: 'suspended' }) },
    } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    await expect(svc.login({ tenantCode: 'DEMO', username: 'agent', password: 'password123' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('member password login issues token payload with ownerId null', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'mem1', tenantId: 't1', role: 'member', agentId: null, status: 'active', passwordHash: hash });
    const res = await svc.login({ tenantCode: 'DEMO', username: 'member1', password: 'password123' });
    const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.role).toBe('member');
    expect(payload.agentId).toBeNull();
    expect(payload.ownerId).toBeNull();
  });

  it('password login includes sessionVersion in access token', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({
      id: 'u1',
      tenantId: 't1',
      role: 'merchant',
      agentId: null,
      status: 'active',
      passwordHash: hash,
      sessionVersion: 3,
    });

    const res = await svc.login({ tenantCode: 'DEMO', username: 'merchantA', password: 'password123' });
    const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.sessionVersion).toBe(3);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it('password login access token expires in 15 minutes', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', passwordHash: hash });

    const res = await svc.login({ tenantCode: 'DEMO', username: 'merchantA', password: 'password123' });
    const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.exp - payload.iat).toBe(15 * 60);
  });
});

describe('AuthService.loginMiniapp', () => {
  it('records current consent before returning password-login tokens', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(activeTenantRow) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          tenantId: 't1',
          role: 'merchant',
          agentId: null,
          status: 'active',
          passwordHash,
        }),
      },
    };
    const legal = stubLegal();
    const service = new AuthService(
      prisma as never,
      new JwtService({ secret: 'test' }),
      stubWechat(),
      stubGroups(),
      legal,
    );

    const result = await service.loginMiniapp({
      tenantCode: 'DEMO',
      username: 'merchantA',
      password: 'password123',
      publicationId,
    });

    expect(legal.recordConsent).toHaveBeenCalledWith({
      tenantId: 't1',
      userId: 'u1',
      publicationId,
    });
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it('does not issue tokens when publication validation fails', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(activeTenantRow) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          tenantId: 't1',
          role: 'merchant',
          agentId: null,
          status: 'active',
          passwordHash,
        }),
      },
    };
    const legal = stubLegal();
    legal.recordConsent.mockRejectedValue(
      new ConflictException('协议版本已更新，请重新阅读并同意'),
    );
    const jwt = new JwtService({ secret: 'test' });
    const signAsync = vi.spyOn(jwt, 'signAsync');
    const service = new AuthService(
      prisma as never,
      jwt,
      stubWechat(),
      stubGroups(),
      legal,
    );

    await expect(service.loginMiniapp({
      tenantCode: 'DEMO',
      username: 'merchantA',
      password: 'password123',
      publicationId,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(signAsync).not.toHaveBeenCalled();
  });
});

describe('AuthService.refresh', () => {
  // refresh 现在查库:构造带 user.findUnique 的 prisma。
  const makeRefreshSvc = (user: any) => {
    const jwt = new JwtService({ secret: 'test' });
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
    return { svc: new AuthService(prisma, jwt, stubWechat(), stubGroups(), stubLegal()), jwt };
  };
  const signRt = (jwt: JwtService) => jwt.signAsync(
    { userId: 'u1', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'u1' },
    { secret: 'test', expiresIn: '7d' },
  );

  it('有效 refresh + 用户 active + 租户 active → 重新签发', async () => {
    const { svc, jwt } = makeRefreshSvc({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', tenant: activeTenant });
    const res = await svc.refresh(await signRt(jwt));
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('无效 refresh token 抛 Unauthorized', async () => {
    const { svc } = makeRefreshSvc(null);
    await expect(svc.refresh('garbage.token.value')).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户已被删除(查库为空)抛 Unauthorized(#22 吊销)', async () => {
    const { svc, jwt } = makeRefreshSvc(null);
    await expect(svc.refresh(await signRt(jwt))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户被停用(status!=active)抛 Unauthorized(#22 吊销)', async () => {
    const { svc, jwt } = makeRefreshSvc({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'suspended', tenant: activeTenant });
    await expect(svc.refresh(await signRt(jwt))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('租户停用抛 Unauthorized(#22 吊销)', async () => {
    const { svc, jwt } = makeRefreshSvc({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', tenant: { status: 'suspended' } });
    await expect(svc.refresh(await signRt(jwt))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects stale refresh token when sessionVersion no longer matches DB', async () => {
    const { svc, jwt } = makeRefreshSvc({
      id: 'u1',
      tenantId: 't1',
      role: 'merchant',
      agentId: null,
      status: 'active',
      sessionVersion: 2,
      tenant: activeTenant,
    });
    const stale = await jwt.signAsync(
      { userId: 'u1', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'u1', sessionVersion: 1 },
      { secret: 'test', expiresIn: '7d' },
    );

    await expect(svc.refresh(stale)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects refresh when agent_admin linked agent is missing', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u-agent',
          tenantId: 't1',
          role: 'agent_admin',
          agentId: 'a-missing',
          status: 'active',
          tenant: activeTenant,
        }),
      },
      agent: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const svc = new AuthService(prisma, jwt, stubWechat(), stubGroups(), stubLegal());
    await expect(svc.refresh(await signRt(jwt))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refresh rebuilds member payload with ownerId null', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mem1',
          tenantId: 't1',
          role: 'member',
          agentId: null,
          status: 'active',
          tenant: activeTenant,
        }),
      },
    } as any;
    const svc = new AuthService(prisma, jwt, stubWechat(), stubGroups(), stubLegal());
    const input = await jwt.signAsync(
      { userId: 'mem1', tenantId: 't1', role: 'member', agentId: null, ownerId: null },
      { secret: 'test', expiresIn: '7d' },
    );

    const res = await svc.refresh(input);
    const payload = jwt.verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.role).toBe('member');
    expect(payload.ownerId).toBeNull();
  });
});

const wxFetch = (body: any) => vi.fn().mockResolvedValue({ json: async () => body });

function makeWechatService(opts: { lookup?: any; existingUser?: any; users?: any[] }) {
  const jwt = new JwtService({ secret: 'test' });
  const created: any[] = [];
  const users = opts.users ?? (opts.existingUser ? [opts.existingUser] : []);
  const findByTenantOpenid = (tenantId: string, wxOpenid: string) => (
    users.find(u => u.tenantId === tenantId && u.wxOpenid === wxOpenid) ?? null
  );
  const prisma = {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.tenantId_wxOpenid) {
          return findByTenantOpenid(where.tenantId_wxOpenid.tenantId, where.tenantId_wxOpenid.wxOpenid);
        }
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => findByTenantOpenid(where.tenantId, where.wxOpenid)),
      create: vi.fn().mockImplementation(async ({ data }: any) => { const u = { id: 'newu', ...data }; created.push(u); return u; }),
    },
  } as any;
  const integrations = stubIntegrations(opts.lookup ?? null);
  const groups = stubGroups('gDefault');
  const legal = stubLegal();
  const svc = new AuthService(
    prisma,
    jwt,
    new WechatIdentityService(integrations),
    groups,
    legal,
  );
  return { svc, prisma, integrations, groups, legal, created };
}

describe('AuthService.loginWechatMiniapp', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('records the current publication for the authenticated WeChat user', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'OPENID123' }));
    const { svc, legal } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: {
        id: 'u9',
        tenantId: 't1',
        role: 'merchant',
        agentId: null,
        status: 'active',
        wxOpenid: 'OPENID123',
        tenant: activeTenant,
      },
    });

    await expect(svc.loginWechatMiniapp({
      code: 'fresh-code',
      appId: 'wxX',
      publicationId,
    })).resolves.toMatchObject({ accessToken: expect.any(String) });
    expect(legal.recordConsent).toHaveBeenCalledWith({
      tenantId: 't1',
      userId: 'u9',
      publicationId,
    });
  });
});

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
      existingUser: { id: 'u9', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'OPENID123', tenant: activeTenant },
    });
    const res = await svc.loginWechat({ code: 'c', appId: 'wxX' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('same wxOpenid in another tenant does not affect current tenant login', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'SHARED_OPENID' }));
    const { svc, prisma } = makeWechatService({
      lookup: { tenantId: 't2', secret: 's2' },
      users: [
        { id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'SHARED_OPENID', tenant: activeTenant },
        { id: 'u2', tenantId: 't2', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'SHARED_OPENID', tenant: activeTenant },
      ],
    });

    const res = await svc.loginWechat({ code: 'c', appId: 'wxTenant2' });
    const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.userId).toBe('u2');
    expect(payload.tenantId).toBe('t2');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { tenantId_wxOpenid: { tenantId: 't2', wxOpenid: 'SHARED_OPENID' } },
      include: { tenant: { select: { status: true } } },
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
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
      existingUser: { id: 'u8', tenantId: 't1', role: 'merchant', agentId: null, status: 'pending', wxOpenid: 'PENDOPENID', tenant: activeTenant },
    });
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('所属租户停用时抛 Forbidden(#26)', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'SUSPOPENID' }));
    const { svc } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: { id: 'u7', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'SUSPOPENID', tenant: { status: 'suspended' } },
    });
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects WeChat login when agent_admin linked agent is suspended', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'AGENTOPENID' }));
    const { svc, prisma } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: {
        id: 'u-agent',
        tenantId: 't1',
        role: 'agent_admin',
        agentId: 'a-suspended',
        status: 'active',
        wxOpenid: 'AGENTOPENID',
        tenant: activeTenant,
      },
    });
    prisma.agent = { findFirst: vi.fn().mockResolvedValue({ status: 'suspended' }) };
    await expect(svc.loginWechat({ code: 'c', appId: 'wxX' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'a-suspended', tenantId: 't1' },
      select: { status: true },
    });
  });
});

describe('AuthService.registerWechat', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('未配置微信抛 Unauthorized', async () => {
    const { svc } = makeWechatService({ lookup: null });
    await expect(svc.registerWechat({ appId: 'wxX', code: 'c', displayName: '张三' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('新用户建为 pending/merchant/默认组,返回真实申请编号且不发 token', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'REGOPENID' }));
    const { svc, created, groups } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });
    const res = await svc.registerWechat({ appId: 'wxX', code: 'c', displayName: '李四', phone: '13800001111' });
    expect(res).toEqual({ applicationId: 'newu', status: 'pending' });
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
  it('same wxOpenid in another tenant does not block current tenant registration', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'CROSS_TENANT_OPENID' }));
    const { svc, prisma, created } = makeWechatService({
      lookup: { tenantId: 't2', secret: 's2' },
      users: [
        { id: 'u1', tenantId: 't1', wxOpenid: 'CROSS_TENANT_OPENID', status: 'active' },
      ],
    });

    await expect(svc.registerWechat({ appId: 'wxTenant2', code: 'c', displayName: 'Zhao Liu' }))
      .resolves.toEqual({ applicationId: 'newu', status: 'pending' });
    expect(created).toHaveLength(1);
    expect(created[0].tenantId).toBe('t2');
    expect(created[0].wxOpenid).toBe('CROSS_TENANT_OPENID');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { tenantId_wxOpenid: { tenantId: 't2', wxOpenid: 'CROSS_TENANT_OPENID' } },
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('AuthService.registerWechatMiniapp', () => {
  it('creates the pending WeChat user and consent in one transaction', async () => {
    const publication = {
      id: publicationId,
      tenantId: 't1',
      privacyVersion: 'privacy-v1',
      agreementVersion: 'agreement-v1',
    };
    const transaction = {
      user: {
        create: vi.fn().mockResolvedValue({ id: 'newu' }),
      },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    };
    const wechat = {
      resolve: vi.fn().mockResolvedValue({ tenantId: 't1', openid: 'REGOPENID' }),
    };
    const legal = stubLegal();
    legal.requireCurrentPublication.mockResolvedValue(publication);
    const service = new AuthService(
      prisma as never,
      new JwtService({ secret: 'test' }),
      wechat as never,
      stubGroups('gDefault'),
      legal,
    );

    await expect(service.registerWechatMiniapp({
      appId: 'wxX',
      code: 'fresh-code',
      displayName: '李四',
      phone: '13800001111',
      publicationId,
    })).resolves.toEqual({ applicationId: 'newu', status: 'pending' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(legal.requireCurrentPublication).toHaveBeenCalledWith(
      't1',
      publicationId,
      transaction,
    );
    expect(transaction.user.create).toHaveBeenCalledTimes(1);
    expect(legal.createConsent).toHaveBeenCalledWith(transaction, {
      tenantId: 't1',
      userId: 'newu',
      publication,
    });
  });
});

describe('AuthService.getWechatRegistrationStatus', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('looks up the current WeChat identity inside the configured tenant', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'STATUS_OPENID' }));
    const { svc, prisma } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: {
        id: 'application-1',
        tenantId: 't1',
        wxOpenid: 'STATUS_OPENID',
        displayName: '张三',
        status: 'pending',
      },
    });

    await expect(svc.getWechatRegistrationStatus({ appId: 'wxX', code: 'fresh-code' })).resolves.toEqual({
      applicationId: 'application-1',
      displayName: '张三',
      status: 'pending',
      updatedAt: null,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { tenantId_wxOpenid: { tenantId: 't1', wxOpenid: 'STATUS_OPENID' } },
      select: { id: true, displayName: true, status: true },
    });
  });

  it.each([
    ['active', 'approved'],
    ['rejected', 'rejected_or_suspended'],
    ['suspended', 'rejected_or_suspended'],
  ])('maps stored status %s to truthful registration status %s', async (storedStatus, expectedStatus) => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'STATUS_OPENID' }));
    const { svc } = makeWechatService({
      lookup: { tenantId: 't1', secret: 's' },
      existingUser: {
        id: 'application-1',
        tenantId: 't1',
        wxOpenid: 'STATUS_OPENID',
        displayName: '张三',
        status: storedStatus,
      },
    });

    await expect(svc.getWechatRegistrationStatus({ appId: 'wxX', code: 'fresh-code' }))
      .resolves.toMatchObject({ status: expectedStatus });
  });

  it('does not disclose a status when the current WeChat identity has no application', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'MISSING_OPENID' }));
    const { svc } = makeWechatService({ lookup: { tenantId: 't1', secret: 's' } });

    await expect(svc.getWechatRegistrationStatus({ appId: 'wxX', code: 'fresh-code' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

const actor = { userId: 'u1', tenantId: 't1', role: 'merchant' as any, agentId: null, ownerId: 'u1' };

describe('AuthService.getMe', () => {
  it('返回个人资料和微信注销验证方式且不泄露敏感字段', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null, displayName: '大理基地', phone: '13800001111', status: 'active', wxOpenid: 'OPENID123' });
    const prisma = { user: { findUnique } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    const me = await svc.getMe(actor);
    expect(me.username).toBe('merchantA');
    expect(me.deletionVerification).toBe('wechat');
    expect((me as any).passwordHash).toBeUndefined();
    expect((me as any).wxOpenid).toBeUndefined();
    // passwordHash 不查；wxOpenid 只用于服务端派生验证方式，不进入返回值。
    const sel = findUnique.mock.calls[0][0].select;
    expect(sel.passwordHash).toBeUndefined();
    expect(sel.wxOpenid).toBe(true);
  });
  it('账号不存在抛 Unauthorized', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    await expect(svc.getMe(actor)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.updateMe', () => {
  it('仅写入 displayName/phone,锁定为本人 id并返回密码注销验证方式', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null, displayName: '新名', phone: '13900002222', status: 'active', wxOpenid: null });
    const prisma = { user: { update } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    const res = await svc.updateMe(actor, { displayName: '新名', phone: '13900002222' });
    expect(res.displayName).toBe('新名');
    expect(res.deletionVerification).toBe('password');
    expect((res as any).wxOpenid).toBeUndefined();
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'u1' });
    expect(arg.data).toEqual({ displayName: '新名', phone: '13900002222' });
    expect(arg.select.wxOpenid).toBe(true);
  });
  it('仅传 phone 时只更新 phone(displayName 不进 data)', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null, displayName: '旧名', phone: '13700003333', status: 'active' });
    const prisma = { user: { update } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    await svc.updateMe(actor, { phone: '13700003333' });
    expect(update.mock.calls[0][0].data).toEqual({ phone: '13700003333' });
  });
});

describe('AuthService.changePassword', () => {
  it('旧密码正确则写入新哈希且哈希可验证', async () => {
    const oldHash = await bcrypt.hash('oldpass123', 10);
    const update = vi.fn().mockResolvedValue({});
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ passwordHash: oldHash }), update } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    const res = await svc.changePassword(actor, { oldPassword: 'oldpass123', newPassword: 'newpass456' });
    expect(res).toEqual({ ok: true });
    const newHash = update.mock.calls[0][0].data.passwordHash;
    expect(newHash).not.toBe(oldHash);
    expect(await bcrypt.compare('newpass456', newHash)).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        passwordHash: newHash,
        sessionVersion: { increment: 1 },
      },
    });
  });
  it('旧密码错误抛 Unauthorized 且不改密', async () => {
    const oldHash = await bcrypt.hash('oldpass123', 10);
    const update = vi.fn();
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ passwordHash: oldHash }), update } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    await expect(svc.changePassword(actor, { oldPassword: 'wrongold', newPassword: 'newpass456' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });
  it('账号不存在抛 Unauthorized', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } } as any;
    const svc = new AuthService(prisma, new JwtService({ secret: 'test' }), stubWechat(), stubGroups(), stubLegal());
    await expect(svc.changePassword(actor, { oldPassword: 'x123456', newPassword: 'y123456' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
