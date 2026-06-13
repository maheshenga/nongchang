import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

describe('Supply e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let batchAId: string;
  const createdSupplyIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    tokenA = await login(app, 'merchantA');
    tokenB = await login(app, 'merchantB');
    const userA = await prisma.user.findFirst({ where: { username: 'merchantA' } });
    const batchA = await prisma.batch.findFirst({ where: { ownerId: userA!.id } });
    batchAId = batchA!.id;
  });

  afterAll(async () => {
    if (createdSupplyIds.length) {
      await prisma.supplyIssue.deleteMany({ where: { supplyId: { in: createdSupplyIds } } });
      await prisma.farmRecord.deleteMany({ where: { supplyId: { in: createdSupplyIds } } });
      await prisma.supply.deleteMany({ where: { id: { in: createdSupplyIds } } });
    }
    await app.close();
  });

  it('入库 → 领用扣减 → 列表 remaining 正确', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e复合肥', unit: '包', amount: 100 });
    expect(create.status).toBe(201);
    const id = create.body.id;
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
      .send({ name: 'e2e尿素', unit: '袋', amount: 10 });
    const id = create.body.id;
    createdSupplyIds.push(id);
    const issue = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 50 });
    expect(issue.status).toBe(400);
    const after = await prisma.supply.findUnique({ where: { id } });
    expect(after!.used).toBe(0);
  });

  it('作用域隔离:merchantB 看不到 A 的农资,越权领用/删除被拒', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e隔离品', unit: '件', amount: 20 });
    const id = create.body.id;
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
      .send({ name: 'e2e核销品', unit: '桶', amount: 200 });
    const id = create.body.id;
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
  });
});
