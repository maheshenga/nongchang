import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const CONNECTED_GROUP_PERMISSIONS = [
  'record:create',
  'record:view',
  'field:view',
  'batch:view',
  'trace:view',
] as const;

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantCode: 'DEMO', username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

function requireCreatedSupplyId(body: unknown): string {
  const id = (body as { id?: unknown } | null)?.id;
  expect(typeof id).toBe('string');
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Supply create response must contain a non-empty string id');
  }
  expect(id.length).toBeGreaterThan(0);
  return id;
}

describe('Supply e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let batchAId: string;
  let userAId: string | undefined;
  let userBId: string | undefined;
  let originalGroupIds: { userA: string | null; userB: string | null } | undefined;
  const createdSupplyIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    const userA = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId: tenant.id, username: 'merchantA' } },
    });
    const userB = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId: tenant.id, username: 'merchantB' } },
    });
    userAId = userA.id;
    userBId = userB.id;
    originalGroupIds = { userA: userA.groupId, userB: userB.groupId };
    const recordGroup = await prisma.userGroup.upsert({
      where: { tenantId_name: { tenantId: userA.tenantId, name: 'e2e记录权限组' } },
      update: { permissions: [...CONNECTED_GROUP_PERMISSIONS] },
      create: {
        tenantId: userA.tenantId,
        name: 'e2e记录权限组',
        isDefault: false,
        permissions: [...CONNECTED_GROUP_PERMISSIONS],
      },
    });
    await prisma.user.updateMany({
      where: { id: { in: [userA.id, userB.id] } },
      data: { groupId: recordGroup.id },
    });
    tokenA = await login(app, 'merchantA');
    tokenB = await login(app, 'merchantB');
    const batchA = await prisma.batch.findFirstOrThrow({
      where: { tenantId: tenant.id, ownerId: userA.id },
    });
    batchAId = batchA.id;
  });

  afterAll(async () => {
    try {
      const supplyIds = createdSupplyIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      );
      if (prisma && supplyIds.length) {
        await prisma.supplyIssue.deleteMany({ where: { supplyId: { in: supplyIds } } });
        const records = await prisma.farmRecord.findMany({
          where: { supplyId: { in: supplyIds } },
          select: { id: true },
        });
        const recordIds = records
          .map((record) => record.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (recordIds.length) {
          await prisma.traceEvent.deleteMany({ where: { sourceFarmRecordId: { in: recordIds } } });
        }
        await prisma.farmRecord.deleteMany({ where: { supplyId: { in: supplyIds } } });
        await prisma.supply.deleteMany({ where: { id: { in: supplyIds } } });
      }
    } finally {
      try {
        if (prisma && userAId && userBId && originalGroupIds) {
          await prisma.$transaction([
            prisma.user.updateMany({ data: { groupId: originalGroupIds.userA }, where: { id: userAId } }),
            prisma.user.updateMany({ data: { groupId: originalGroupIds.userB }, where: { id: userBId } }),
          ]);
        }
      } finally {
        if (app) await app.close();
      }
    }
  });

  it('入库 → 领用扣减 → 列表 remaining 正确', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e复合肥', unit: '包', amount: 100 })
      .expect(201);
    const id = requireCreatedSupplyId(create.body);
    createdSupplyIds.push(id);
    expect(create.body.remaining).toBe(100);

    const issue = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 30 });
    expect(issue.status).toBe(201);
    expect(issue.body.used).toBe(30);
    expect(issue.body.remaining).toBe(70);

    const list = await request(app.getHttpServer())
      .get('/api/supplies').set('Authorization', `Bearer ${tokenA}`);
    const found = list.body.find((s: any) => s.id === id);
    expect(found.remaining).toBe(70);
  });

  it('领用超量 → 400 熔断,库存不变', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e尿素', unit: '袋', amount: 10 })
      .expect(201);
    const id = requireCreatedSupplyId(create.body);
    createdSupplyIds.push(id);
    const issue = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 50 });
    expect(issue.status).toBe(400);
    const after = await prisma.supply.findUnique({ where: { id } });
    expect(Number(after!.used)).toBe(0);
  });

  it('作用域隔离:merchantB 看不到 A 的农资,越权领用/删除被拒', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e隔离品', unit: '件', amount: 20 })
      .expect(201);
    const id = requireCreatedSupplyId(create.body);
    createdSupplyIds.push(id);

    const listB = await request(app.getHttpServer())
      .get('/api/supplies').set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.find((s: any) => s.id === id)).toBeUndefined();

    const issueB = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenB}`)
      .send({ batchId: batchAId, amount: 1 });
    expect(issueB.status).toBe(403);

    const delB = await request(app.getHttpServer())
      .delete(`/api/supplies/${id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(delB.status).toBe(403);
  });

  it('核销:领用配额后打卡超110% → 400;未超 → 201 落两列', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e核销品', unit: '桶', amount: 200 })
      .expect(201);
    const id = requireCreatedSupplyId(create.body);
    createdSupplyIds.push(id);
    await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 100 });
    const batchA = await prisma.batch.findFirst({ where: { id: batchAId } });

    const ok = await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, fieldId: batchA!.fieldId, action: '施肥',
        recordedAt: new Date().toISOString(), source: 'miniapp', supplyId: id, supplyAmount: 100 });
    expect(ok.status).toBe(201);
    expect(ok.body.supplyId).toBe(id);
    expect(ok.body.supplyAmount).toBe(100);

    const bad = await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, fieldId: batchA!.fieldId, action: '施肥',
        recordedAt: new Date().toISOString(), source: 'miniapp', supplyId: id, supplyAmount: 20 });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('实际用量超过领用配额 110%,核销熔断');
  });
});
