import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantCode: 'DEMO', username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

async function codeBalance(app: INestApplication, token: string): Promise<number> {
  const res = await request(app.getHttpServer())
    .get('/api/billing/summary').set('Authorization', `Bearer ${token}`);
  return res.body.codeBalance;
}

describe('Billing e2e', () => {
  const previousAllowManualPay = process.env.ALLOW_MANUAL_PAY;
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let agentToken: string;
  let merchantToken: string;
  let merchantUserId: string;
  let merchantTenantId: string;
  let agentId: string;
  let batchId: string;
  const createdCodes: string[] = [];
  let createdBatchId: string | null = null;
  let createdFieldId: string | null = null;
  const createdPlanIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    process.env.ALLOW_MANUAL_PAY = 'true';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sysToken = await login(app, 'sysadmin');
    agentToken = await login(app, 'agentA');
    merchantToken = await login(app, 'merchantA');

    const demoTenant = await prisma.tenant.findUnique({ where: { code: 'DEMO' } });
    const userA = await prisma.user.findUnique({
      where: { tenantId_username: { tenantId: demoTenant!.id, username: 'merchantA' } },
    });
    merchantUserId = userA!.id;
    merchantTenantId = userA!.tenantId;
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
    try {
      if (createdCodes.length) {
        await prisma.traceCode.deleteMany({ where: { code: { in: createdCodes } } });
      }
      if (createdOrderIds.length) {
        await prisma.creditLedger.deleteMany({ where: { refType: 'order', refId: { in: createdOrderIds } } });
        await prisma.creditOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
      }
      if (createdPlanIds.length) {
        await prisma.creditPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
      }
      if (createdBatchId) await prisma.batch.deleteMany({ where: { id: createdBatchId } });
      if (createdFieldId) await prisma.field.deleteMany({ where: { id: createdFieldId } });
    // 本套用例会把 merchantA 的 CODE 余额压到 2(熔断用例),恢复到种子额度,
    // 避免后续 e2e(如 trace-codes)因余额不足被计费硬熔断而误报 403。
      await prisma.creditAccount.updateMany({
        where: { ownerType: 'MERCHANT', ownerId: merchantUserId },
        data: { codeBalance: 10000 },
      });
    } finally {
      try {
        await app.close();
      } finally {
        if (previousAllowManualPay === undefined) delete process.env.ALLOW_MANUAL_PAY;
        else process.env.ALLOW_MANUAL_PAY = previousAllowManualPay;
      }
    }
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

  it('预约扣费 + 流水:生码扣 CODE 额度,产生 RESERVED 与 CONFIRMED 流水,同 key 重试不重复产码', async () => {
    const before = await codeBalance(app, merchantToken);
    const requestKey = `billing-e2e-${Date.now()}`;
    const generationKey = `trace.generate:${merchantTenantId}:${merchantUserId}:${batchId}:${requestKey}`;

    const gen = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchId}?count=5`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .set('Idempotency-Key', requestKey);
    expect(gen.status).toBe(201);
    expect(gen.body).toHaveLength(5);
    for (const c of gen.body) createdCodes.push(c.code);

    const after = await codeBalance(app, merchantToken);
    expect(after).toBe(before - 5);

    const retry = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchId}?count=5`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .set('Idempotency-Key', requestKey);
    expect(retry.status).toBe(201);
    expect(retry.body.map((item: any) => item.code)).toEqual(gen.body.map((item: any) => item.code));
    expect(await codeBalance(app, merchantToken)).toBe(after);

    const ledger = await request(app.getHttpServer())
      .get('/api/billing/ledger?resource=CODE&page=1&pageSize=10').set('Authorization', `Bearer ${merchantToken}`);
    expect(ledger.status).toBe(200);
    const reserved = ledger.body.items.find(
      (it: any) => it.reason === 'RESERVED' && it.resource === 'CODE' && it.delta === -5 && it.refId === batchId,
    );
    const confirmed = ledger.body.items.find(
      (it: any) => it.reason === 'CONFIRMED' && it.resource === 'CODE' && it.delta === 0 && it.refId === batchId,
    );
    expect(reserved).toBeDefined();
    expect(confirmed).toBeDefined();
    expect(reserved.refType).toBe('trace.generate');
    expect(confirmed.refType).toBe('trace.generate');

    const generatedLedgers = await prisma.creditLedger.findMany({
      where: { idempotencyKey: generationKey },
      orderBy: { createdAt: 'asc' },
    });
    expect(generatedLedgers.map((item) => item.reason).sort()).toEqual(['CONFIRMED', 'RESERVED']);
    expect(generatedLedgers).toHaveLength(2);
    expect(generatedLedgers).toEqual(expect.arrayContaining([
      expect.objectContaining({ resource: 'CODE', delta: -5, refType: 'trace.generate', refId: batchId }),
      expect.objectContaining({ resource: 'CODE', delta: 0, refType: 'trace.generate', refId: batchId }),
    ]));
  });

  it('余额耗尽:CODE 不足时生码返回 403,不产码', async () => {
    await prisma.creditAccount.updateMany({
      where: { ownerType: 'MERCHANT', ownerId: merchantUserId },
      data: { codeBalance: 2 },
    });

    const before = await prisma.traceCode.count({ where: { batchId } });
    const gen = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchId}?count=5`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .set('Idempotency-Key', `billing-e2e-insufficient-${Date.now()}`);
    expect(gen.status).toBe(403);

    const after = await prisma.traceCode.count({ where: { batchId } });
    expect(after).toBe(before);
  });

  it('自助购买闭环:管理员建套餐→商户下单→支付→AI 余额到账+PURCHASE 流水', async () => {
    // 管理员建一个固定套餐(AI 100 次 / ¥10)
    const planRes = await request(app.getHttpServer())
      .post('/api/billing/plans').set('Authorization', `Bearer ${sysToken}`)
      .send({ name: `e2e-AI100-${Date.now()}`, resource: 'AI', quantity: 100, priceCents: 1000, isUnit: false, active: true });
    expect([200, 201]).toContain(planRes.status);
    const planId = planRes.body.id;
    createdPlanIds.push(planId);

    // 套餐对商户可见
    const plans = await request(app.getHttpServer())
      .get('/api/billing/plans').set('Authorization', `Bearer ${merchantToken}`);
    expect(plans.status).toBe(200);
    expect(plans.body.find((p: any) => p.id === planId)).toBeTruthy();

    // 商户下单
    const summaryBefore = await request(app.getHttpServer())
      .get('/api/billing/summary').set('Authorization', `Bearer ${merchantToken}`);
    const aiBefore = summaryBefore.body.aiBalance;

    const orderRes = await request(app.getHttpServer())
      .post('/api/billing/orders').set('Authorization', `Bearer ${merchantToken}`)
      .send({ planId });
    expect([200, 201]).toContain(orderRes.status);
    expect(orderRes.body).toMatchObject({ resource: 'AI', quantity: 100, amountCents: 1000, status: 'PENDING' });
    const orderId = orderRes.body.id;
    createdOrderIds.push(orderId);

    // 支付(占位)→ 入账
    const payRes = await request(app.getHttpServer())
      .post(`/api/billing/orders/${orderId}/pay`).set('Authorization', `Bearer ${merchantToken}`);
    expect([200, 201]).toContain(payRes.status);
    expect(payRes.body.status).toBe('PAID');

    const summaryAfter = await request(app.getHttpServer())
      .get('/api/billing/summary').set('Authorization', `Bearer ${merchantToken}`);
    expect(summaryAfter.body.aiBalance).toBe(aiBefore + 100);

    // PURCHASE 流水存在
    const ledger = await request(app.getHttpServer())
      .get('/api/billing/ledger?resource=AI&reason=PURCHASE&page=1&pageSize=10').set('Authorization', `Bearer ${merchantToken}`);
    expect(ledger.status).toBe(200);
    const purchase = ledger.body.items.find((it: any) => it.reason === 'PURCHASE' && it.refId === orderId && it.delta === 100);
    expect(purchase).toBeDefined();

    // 幂等:重复支付不二次入账
    const payAgain = await request(app.getHttpServer())
      .post(`/api/billing/orders/${orderId}/pay`).set('Authorization', `Bearer ${merchantToken}`);
    expect([200, 201]).toContain(payAgain.status);
    const summaryFinal = await request(app.getHttpServer())
      .get('/api/billing/summary').set('Authorization', `Bearer ${merchantToken}`);
    expect(summaryFinal.body.aiBalance).toBe(aiBefore + 100);
  });

  it('平台账户租户隔离:PLATFORM 账户按 tenantId 区分,不跨租户串账', async () => {
    // 为 DEMO 租户充值后,另建一个独立租户的 PLATFORM 账户,二者余额必须互不影响。
    await request(app.getHttpServer())
      .post('/api/billing/recharge').set('Authorization', `Bearer ${sysToken}`)
      .send({ resource: 'AI', amount: 777 });

    const demoTenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } });
    const otherTenant = await prisma.tenant.upsert({
      where: { code: 'BILLISO' },
      update: {},
      create: { name: '计费隔离测试租户', code: 'BILLISO' },
    });

    const demoPlatform = await prisma.creditAccount.findFirst({
      where: { tenantId: demoTenant!.id, ownerType: 'PLATFORM', ownerId: 'PLATFORM' },
    });
    expect(demoPlatform).toBeTruthy();

    // 另租户的 PLATFORM 账户独立存在(此前会命中同一行)
    const otherPlatform = await prisma.creditAccount.create({
      data: { tenantId: otherTenant.id, ownerType: 'PLATFORM', ownerId: 'PLATFORM', aiBalance: 0, codeBalance: 0 },
    });
    expect(otherPlatform.id).not.toBe(demoPlatform!.id);
    expect(otherPlatform.aiBalance).toBe(0);
    expect(demoPlatform!.aiBalance).toBeGreaterThanOrEqual(777);

    // 清理
    await prisma.creditAccount.deleteMany({ where: { tenantId: otherTenant.id } });
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } });
  });
});
