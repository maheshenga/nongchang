import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('account data tenant and user isolation e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let target: Awaited<ReturnType<typeof seedOwnedData>>;
  let decoy: Awaited<ReturnType<typeof seedOwnedData>>;
  const suffix = Date.now().toString(36).toUpperCase();
  const tenantCodes = [`AD${suffix}A`, `AD${suffix}B`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 10);
    target = await seedOwnedData(prisma, {
      tenantCode: tenantCodes[0],
      tenantName: '账户数据目标租户',
      username: 'targetMerchant',
      marker: `target-${suffix}`,
      passwordHash,
    });
    decoy = await seedOwnedData(prisma, {
      tenantCode: tenantCodes[1],
      tenantName: '账户数据诱饵租户',
      username: 'decoyMerchant',
      marker: `decoy-${suffix}`,
      passwordHash,
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantCode: tenantCodes[0], username: 'targetMerchant', password: 'password123' })
      .expect(201);
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    if (prisma) await cleanup(prisma, tenantCodes);
    if (app) await app.close();
  });

  it('returns only the target user rows in counts and latest collections', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me/data')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.tenant).toMatchObject({ id: target.tenantId, code: tenantCodes[0] });
    expect(response.body.account).toMatchObject({ id: target.userId, username: 'targetMerchant' });
    expect(response.body.counts).toEqual({
      fields: 1,
      batches: 1,
      farmRecords: 1,
      supplies: 1,
      supplyIssues: 1,
      uploads: 1,
      aiOperations: 1,
      creditOrders: 1,
      creditLedgers: 1,
    });
    expect(response.body.recent.fields.map((row: { id: string }) => row.id)).toEqual([target.fieldId]);
    expect(response.body.recent.batches.map((row: { id: string }) => row.id)).toEqual([target.batchId]);
    expect(response.body.recent.farmRecords.map((row: { id: string }) => row.id)).toEqual([target.farmRecordId]);
    expect(response.body.recent.supplies.map((row: { id: string }) => row.id)).toEqual([target.supplyId]);
    expect(response.body.recent.supplyIssues.map((row: { id: string }) => row.id)).toEqual([target.supplyIssueId]);
    expect(response.body.recent.uploads.map((row: { id: string }) => row.id)).toEqual([target.uploadId]);
    expect(response.body.recent.aiOperations.map((row: { id: string }) => row.id)).toEqual([target.aiOperationId]);
    expect(response.body.recent.creditOrders.map((row: { id: string }) => row.id)).toEqual([target.creditOrderId]);
    expect(response.body.recent.creditAccount.ledgers.map((row: { id: string }) => row.id))
      .toEqual([target.creditLedgerId]);
    expect(JSON.stringify(response.body)).not.toContain(decoy.marker);
  });

  it('exports a safe JSON attachment without secret or decoy markers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me/data/export')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/);
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="nongchang-account-data-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
    expect(response.body.schemaVersion).toBe(1);
    expect(response.body.exclusions).toContain(
      '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
    );
    const serialized = JSON.stringify(response.body);
    expect(serialized).toContain(target.marker);
    expect(serialized).not.toContain(decoy.marker);
    for (const secret of [
      target.objectKey,
      target.checksum,
      target.resultSecret,
      target.tradeNo,
      target.idempotencyKey,
      decoy.objectKey,
      decoy.checksum,
      decoy.resultSecret,
      decoy.tradeNo,
      decoy.idempotencyKey,
    ]) expect(serialized).not.toContain(secret);
  });
});

async function seedOwnedData(
  prisma: PrismaService,
  input: {
    tenantCode: string;
    tenantName: string;
    username: string;
    marker: string;
    passwordHash: string;
  },
) {
  const tenant = await prisma.tenant.create({
    data: { code: input.tenantCode, name: input.tenantName },
  });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: input.username,
      passwordHash: input.passwordHash,
      role: 'merchant',
      displayName: input.marker,
      status: 'active',
    },
  });
  const field = await prisma.field.create({
    data: { tenantId: tenant.id, ownerId: user.id, name: `${input.marker}-field`, area: 1.25 },
  });
  const batch = await prisma.batch.create({
    data: {
      tenantId: tenant.id,
      ownerId: user.id,
      fieldId: field.id,
      batchNo: `${input.marker}-batch`,
      cropName: `${input.marker}-crop`,
      plantDate: new Date('2026-01-01T00:00:00.000Z'),
      expectedHarvest: new Date('2026-10-01T00:00:00.000Z'),
      status: 'Growing',
    },
  });
  const farmRecord = await prisma.farmRecord.create({
    data: {
      tenantId: tenant.id,
      batchId: batch.id,
      fieldId: field.id,
      operatorId: user.id,
      action: `${input.marker}-record`,
      detail: { marker: input.marker },
      images: [`https://cdn.example.com/${input.marker}.jpg`],
      recordedAt: new Date('2026-07-14T09:00:00.000Z'),
      source: 'e2e',
      status: 'completed',
    },
  });
  const supply = await prisma.supply.create({
    data: {
      tenantId: tenant.id,
      ownerId: user.id,
      name: `${input.marker}-supply`,
      unit: 'kg',
      total: 10,
      used: 1,
    },
  });
  const supplyIssue = await prisma.supplyIssue.create({
    data: {
      tenantId: tenant.id,
      ownerId: user.id,
      supplyId: supply.id,
      batchId: batch.id,
      amount: 1,
      unitPrice: 3,
    },
  });
  const objectKey = `account-e2e/${input.marker}/private-object`;
  const checksum = `${input.marker}-secret-checksum`;
  const upload = await prisma.uploadAsset.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      purpose: input.marker,
      objectKey,
      url: `https://cdn.example.com/${input.marker}.jpg`,
      sizeBytes: 1234n,
      checksum,
      status: 'ACTIVE',
    },
  });
  const resultSecret = `${input.marker}-result-secret`;
  const aiOperation = await prisma.aiOperation.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      kind: input.marker,
      operationKey: `${input.marker}-operation`,
      status: 'SUCCEEDED',
      resultEnvelope: { secret: resultSecret },
    },
  });
  const tradeNo = `${input.marker}-secret-trade`;
  const creditOrder = await prisma.creditOrder.create({
    data: {
      tenantId: tenant.id,
      ownerType: 'MERCHANT',
      ownerId: user.id,
      resource: 'AI',
      quantity: 2,
      amountCents: 200,
      status: 'PAID',
      buyerId: user.id,
      payChannel: 'manual',
      tradeNo,
      paidAt: new Date('2026-07-14T09:00:00.000Z'),
    },
  });
  const creditAccount = await prisma.creditAccount.create({
    data: {
      tenantId: tenant.id,
      ownerType: 'MERCHANT',
      ownerId: user.id,
      aiBalance: 10,
      codeBalance: 20,
    },
  });
  const idempotencyKey = `${input.marker}-secret-idempotency`;
  const creditLedger = await prisma.creditLedger.create({
    data: {
      accountId: creditAccount.id,
      resource: 'AI',
      delta: 10,
      balanceAfter: 10,
      reason: 'PURCHASE',
      note: input.marker,
      idempotencyKey,
    },
  });

  return {
    marker: input.marker,
    tenantId: tenant.id,
    userId: user.id,
    fieldId: field.id,
    batchId: batch.id,
    farmRecordId: farmRecord.id,
    supplyId: supply.id,
    supplyIssueId: supplyIssue.id,
    uploadId: upload.id,
    aiOperationId: aiOperation.id,
    creditOrderId: creditOrder.id,
    creditLedgerId: creditLedger.id,
    objectKey,
    checksum,
    resultSecret,
    tradeNo,
    idempotencyKey,
  };
}

async function cleanup(prisma: PrismaService, codes: string[]) {
  const tenants = await prisma.tenant.findMany({
    where: { code: { in: codes } },
    select: { id: true },
  });
  const tenantIds = tenants.map(tenant => tenant.id);
  if (tenantIds.length === 0) return;
  const accounts = await prisma.creditAccount.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true },
  });
  const accountIds = accounts.map(account => account.id);
  await prisma.creditLedger.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.creditOrder.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.aiOperation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.uploadAsset.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.supplyIssue.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.farmRecord.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.supply.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.batch.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.field.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.creditAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}
