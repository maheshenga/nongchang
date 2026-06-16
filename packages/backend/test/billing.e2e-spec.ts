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

async function codeBalance(app: INestApplication, token: string): Promise<number> {
  const res = await request(app.getHttpServer())
    .get('/api/billing/summary').set('Authorization', `Bearer ${token}`);
  return res.body.codeBalance;
}

describe('Billing e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let agentToken: string;
  let merchantToken: string;
  let merchantUserId: string;
  let agentId: string;
  let batchId: string;
  const createdCodes: string[] = [];
  let createdBatchId: string | null = null;
  let createdFieldId: string | null = null;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sysToken = await login(app, 'sysadmin');
    agentToken = await login(app, 'agentA');
    merchantToken = await login(app, 'merchantA');

    const userA = await prisma.user.findFirst({ where: { username: 'merchantA' } });
    merchantUserId = userA!.id;
    agentId = userA!.agentId!;
    // merchantA 名下批次:若被历史清理删除则按需补建(并记录以便 afterAll 清理)。
    let batchA = await prisma.batch.findFirst({ where: { ownerId: merchantUserId } });
    if (!batchA) {
      const field = await prisma.field.create({
        data: { tenantId: userA!.tenantId, ownerId: merchantUserId, name: 'e2e计费地块', area: 10 },
      });
      createdFieldId = field.id;
      batchA = await prisma.batch.create({
        data: {
          tenantId: userA!.tenantId, ownerId: merchantUserId, fieldId: field.id,
          batchNo: `BILL-E2E-${Date.now()}`, cropName: '白芍',
          plantDate: new Date(), expectedHarvest: new Date(), status: 'Growing',
        },
      });
      createdBatchId = batchA.id;
    }
    batchId = batchA.id;
  });

  afterAll(async () => {
    if (createdCodes.length) {
      await prisma.traceCode.deleteMany({ where: { code: { in: createdCodes } } });
    }
    if (createdBatchId) await prisma.batch.deleteMany({ where: { id: createdBatchId } });
    if (createdFieldId) await prisma.field.deleteMany({ where: { id: createdFieldId } });
    // 本套用例会把 merchantA 的 CODE 余额压到 2(熔断用例),恢复到种子额度,
    // 避免后续 e2e(如 trace-codes)因余额不足被计费硬熔断而误报 403。
    await prisma.creditAccount.updateMany({
      where: { ownerType: 'MERCHANT', ownerId: merchantUserId },
      data: { codeBalance: 10000 },
    });
    await app.close();
  });

  it('充值 + 三级分配:平台→代理→商户,商户 CODE 余额增加 200', async () => {
    const recharge = await request(app.getHttpServer())
      .post('/api/billing/recharge').set('Authorization', `Bearer ${sysToken}`)
      .send({ resource: 'CODE', amount: 1000 });
    expect([200, 201]).toContain(recharge.status);

    const allocToAgent = await request(app.getHttpServer())
      .post('/api/billing/allocate').set('Authorization', `Bearer ${sysToken}`)
      .send({ targetOwnerType: 'AGENT', targetOwnerId: agentId, resource: 'CODE', amount: 500 });
    expect([200, 201]).toContain(allocToAgent.status);

    const before = await codeBalance(app, merchantToken);
    const allocToMerchant = await request(app.getHttpServer())
      .post('/api/billing/allocate').set('Authorization', `Bearer ${agentToken}`)
      .send({ targetOwnerType: 'MERCHANT', targetOwnerId: merchantUserId, resource: 'CODE', amount: 200 });
    expect([200, 201]).toContain(allocToMerchant.status);

    const after = await codeBalance(app, merchantToken);
    expect(after - before).toBe(200);
  });

  it('消费扣费 + 流水:生码扣 CODE 额度,产生 CONSUME 流水', async () => {
    const before = await codeBalance(app, merchantToken);

    const gen = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchId}?count=5`).set('Authorization', `Bearer ${merchantToken}`);
    expect(gen.status).toBe(201);
    expect(gen.body).toHaveLength(5);
    for (const c of gen.body) createdCodes.push(c.code);

    const after = await codeBalance(app, merchantToken);
    expect(after).toBe(before - 5);

    const ledger = await request(app.getHttpServer())
      .get('/api/billing/ledger?resource=CODE&page=1&pageSize=10').set('Authorization', `Bearer ${merchantToken}`);
    expect(ledger.status).toBe(200);
    const consume = ledger.body.items.find(
      (it: any) => it.reason === 'CONSUME' && it.resource === 'CODE' && it.delta === -5,
    );
    expect(consume).toBeDefined();
    expect(consume.refType).toBe('trace.generate');
  });

  it('余额耗尽:CODE 不足时生码返回 403,不产码', async () => {
    await prisma.creditAccount.update({
      where: { ownerType_ownerId: { ownerType: 'MERCHANT', ownerId: merchantUserId } },
      data: { codeBalance: 2 },
    });

    const before = await prisma.traceCode.count({ where: { batchId } });
    const gen = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchId}?count=5`).set('Authorization', `Bearer ${merchantToken}`);
    expect(gen.status).toBe(403);

    const after = await prisma.traceCode.count({ where: { batchId } });
    expect(after).toBe(before);
  });
});
