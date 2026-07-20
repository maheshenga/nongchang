import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;

async function token(username: string, password = 'password123') {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ tenantCode: 'DEMO', username, password });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => { await app.close(); });

describe('商户管理(create→initialPassword→PATCH→status)', () => {
  it('system_admin 创建商户返回 initialPassword,改名并停用', async () => {
    const t = await token('sysadmin');
    const created = await request(app.getHttpServer())
      .post('/api/users').set('Authorization', `Bearer ${t}`)
      .send({ username: 'm_e2e_' + Date.now(), role: 'merchant', displayName: '测试商户' })
      .expect(201);
    expect(typeof created.body.initialPassword).toBe('string');
    expect(created.body.initialPassword.length).toBeGreaterThan(0);
    const id = created.body.id as string;
    expect(typeof id).toBe('string');

    const patched = await request(app.getHttpServer())
      .patch(`/api/users/${id}`).set('Authorization', `Bearer ${t}`)
      .send({ displayName: '改名商户', phone: '13800000000' })
      .expect(200);
    expect(patched.body.displayName).toBe('改名商户');
    expect(patched.body.phone).toBe('13800000000');

    const status = await request(app.getHttpServer())
      .post(`/api/users/${id}/status`).set('Authorization', `Bearer ${t}`)
      .send({ status: 'suspended' })
      .expect(201);
    expect(status.body.status).toBe('suspended');
  });

  it('GET /api/users/merchants 返回数组且每行含 fieldCount/totalArea', async () => {
    const t = await token('sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/users/merchants').set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const row of res.body) {
      expect(row).toHaveProperty('fieldCount');
      expect(row).toHaveProperty('totalArea');
    }
  });

  it('new merchant receives a group and can use protected reads on first login', async () => {
    const adminToken = await token('sysadmin');
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = `first_login_${suffix}`;
    let userId: string | null = null;
    let fieldId: string | null = null;
    let batchId: string | null = null;

    try {
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, role: 'merchant', displayName: `First login ${suffix}` })
        .expect(201);
      userId = created.body.id as string;

      const createdUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { tenantId: true, groupId: true },
      });
      expect(createdUser?.groupId).toBeTruthy();

      const field = await prisma.field.create({
        data: {
          tenantId: createdUser!.tenantId,
          ownerId: userId,
          name: `First login field ${suffix}`,
          area: 1,
        },
      });
      fieldId = field.id;
      const batch = await prisma.batch.create({
        data: {
          tenantId: createdUser!.tenantId,
          ownerId: userId,
          fieldId,
          batchNo: `FIRST-${suffix}`,
          cropName: 'Test crop',
          plantDate: new Date('2026-01-01T00:00:00.000Z'),
          expectedHarvest: new Date('2026-06-01T00:00:00.000Z'),
          status: 'Planting',
        },
      });
      batchId = batch.id;

      const merchantList = await request(app.getHttpServer())
        .get('/api/users/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const merchant = merchantList.body.find((row: any) => row.id === userId);
      expect(merchant).toMatchObject({
        groupId: createdUser!.groupId,
        groupName: expect.any(String),
      });
      expect(merchant).not.toHaveProperty('group');

      const merchantToken = await token(username, created.body.initialPassword);
      expect(merchantToken).toEqual(expect.any(String));

      for (const path of ['/api/fields', '/api/batches', '/api/farm-records']) {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${merchantToken}`)
          .expect(200);
      }
      await request(app.getHttpServer())
        .get(`/api/trace/events/${batchId}`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(200);
    } finally {
      if (batchId) await prisma.traceEvent.deleteMany({ where: { batchId } });
      if (batchId) await prisma.batch.deleteMany({ where: { id: batchId } });
      if (fieldId) await prisma.field.deleteMany({ where: { id: fieldId } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});

describe('代理商管理(CRUD + status)', () => {
  it('system_admin 创建代理商,列表含 merchantCount,改区域并停用', async () => {
    const t = await token('sysadmin');
    const created = await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${t}`)
      .send({ name: '代理_e2e_' + Date.now(), region: '华东' })
      .expect(201);
    const id = created.body.id as string;
    expect(typeof id).toBe('string');

    const list = await request(app.getHttpServer())
      .get('/api/agents').set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    const row = list.body.find((a: any) => a.id === id);
    expect(row).toBeDefined();
    expect(row).toHaveProperty('merchantCount');

    const patched = await request(app.getHttpServer())
      .patch(`/api/agents/${id}`).set('Authorization', `Bearer ${t}`)
      .send({ region: '华南' })
      .expect(200);
    expect(patched.body.region).toBe('华南');

    const status = await request(app.getHttpServer())
      .post(`/api/agents/${id}/status`).set('Authorization', `Bearer ${t}`)
      .send({ status: 'suspended' })
      .expect(201);
    expect(status.body.status).toBe('suspended');
  });
});

describe('越权(代理商管理仅 SYSTEM_ADMIN)', () => {
  it('agent_admin 创建代理商 → 403', async () => {
    const t = await token('agentA');
    await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${t}`)
      .send({ name: '越权代理_' + Date.now(), region: '华北' })
      .expect(403);
  });

  it('agent_admin PATCH 代理商 → 403', async () => {
    const t = await token('agentA');
    await request(app.getHttpServer())
      .patch('/api/agents/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${t}`)
      .send({ region: '华北' })
      .expect(403);
  });
});
