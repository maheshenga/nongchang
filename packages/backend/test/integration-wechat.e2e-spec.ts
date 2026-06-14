import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

const TEST_APPID = 'wxe2e_test_appid_0001';
const TEST_OPENID = 'openid_e2e_aaaaaaaa';

describe('Integration config + WeChat login + user-group e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let merchantToken: string;
  let createdGroupId: string | undefined;
  let createdUserId: string | undefined;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sysToken = await login(app, 'sysadmin');
    merchantToken = await login(app, 'merchantA');
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    await prisma.integrationConfig.deleteMany({ where: { appId: TEST_APPID } });
    if (createdGroupId) {
      await prisma.userGroup.deleteMany({ where: { id: createdGroupId } });
    }
    await app.close();
  });

  it('merchant 无权访问集成配置端点 → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/integration-configs/wechat')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(403);
  });

  it('sysadmin 配置微信 secret 脱敏返回,不泄露明文', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/integration-configs/wechat')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ appId: TEST_APPID, secret: 'wx-secret-e2e-9999', enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.appId).toBe(TEST_APPID);
    expect(res.body.secretMasked).toBe('****9999');
    expect(res.body.enabled).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('wx-secret-e2e');
  });

  it('微信登录:新 openid 自动注册并下发 token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ openid: TEST_OPENID, session_key: 'sk' }),
    })) as unknown as typeof fetch);

    const res = await request(app.getHttpServer())
      .post('/api/auth/wechat')
      .send({ appId: TEST_APPID, code: 'js_code_first' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    const created = await prisma.user.findFirst({ where: { wxOpenid: TEST_OPENID } });
    expect(created).toBeTruthy();
    expect(created!.role).toBe('merchant');
    expect(created!.groupId).toBeTruthy();
    createdUserId = created!.id;
  });

  it('微信登录:同 openid 二次登录命中已有用户(不重复注册)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/wechat')
      .send({ appId: TEST_APPID, code: 'js_code_second' });
    expect(res.status).toBe(201);
    const count = await prisma.user.count({ where: { wxOpenid: TEST_OPENID } });
    expect(count).toBe(1);
  });

  it('微信登录:未配置的 appId → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/wechat')
      .send({ appId: 'wx_not_configured', code: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('微信用户 token 可访问受保护端点', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ openid: TEST_OPENID, session_key: 'sk' }),
    })) as unknown as typeof fetch);
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/wechat')
      .send({ appId: TEST_APPID, code: 'js_code_third' });
    const token = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/batches')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('用户组 CRUD + assign(sysadmin)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/user-groups')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ name: 'e2e组_记录员', permissions: ['record:create', 'record:view'] });
    expect(createRes.status).toBe(201);
    createdGroupId = createRes.body.id;
    expect(createRes.body.permissions).toContain('record:create');

    const listRes = await request(app.getHttpServer())
      .get('/api/user-groups')
      .set('Authorization', `Bearer ${sysToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((g: any) => g.id === createdGroupId)).toBe(true);

    const assignRes = await request(app.getHttpServer())
      .put('/api/user-groups/assign')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ userId: createdUserId, groupId: createdGroupId });
    expect(assignRes.status).toBe(200);
    const reassigned = await prisma.user.findUnique({ where: { id: createdUserId } });
    expect(reassigned!.groupId).toBe(createdGroupId);
  });

  it('merchant 无权管理用户组 → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/user-groups')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(403);
  });
});
