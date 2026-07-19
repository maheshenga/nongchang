import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const RECORD_GROUP_PERMISSIONS = [
  'record:create',
  'record:view',
  'field:view',
  'batch:view',
  'trace:view',
] as const;

describe('Farm record automatic public trace e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let tenantId: string;
  let batchId: string;
  let fieldId: string;
  let traceCode: string;
  let merchantId: string;
  let originalGroupId: string | null;
  let testGroupId: string;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    tenantId = tenant.id;
    const merchant = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId, username: 'merchantA' } },
    });
    merchantId = merchant.id;
    originalGroupId = merchant.groupId;
    const batch = await prisma.batch.findFirstOrThrow({ where: { tenantId, ownerId: merchantId } });
    batchId = batch.id;
    fieldId = batch.fieldId;

    const group = await prisma.userGroup.create({
      data: {
        tenantId,
        name: `e2e-auto-publication-${randomUUID()}`,
        isDefault: false,
        permissions: [...RECORD_GROUP_PERMISSIONS],
      },
    });
    testGroupId = group.id;
    await prisma.user.update({ where: { id: merchantId }, data: { groupId: testGroupId } });

    token = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantCode: 'DEMO', username: 'merchantA', password: 'password123' })
      .expect(201)).body.accessToken;

    traceCode = `FARM-PUB-${randomUUID()}`;
    await prisma.traceCode.create({ data: { tenantId, batchId, code: traceCode } });
  });

  afterAll(async () => {
    await prisma.traceScan.deleteMany({ where: { code: traceCode } });
    await prisma.traceCode.deleteMany({ where: { code: traceCode } });
    if (createdRecordIds.length) {
      await prisma.traceEvent.deleteMany({ where: { sourceFarmRecordId: { in: createdRecordIds } } });
      await prisma.farmRecord.deleteMany({ where: { id: { in: createdRecordIds } } });
    }
    await prisma.user.update({ where: { id: merchantId }, data: { groupId: originalGroupId } });
    await prisma.userGroup.delete({ where: { id: testGroupId } });
    await app.close();
  });

  it('publishes completed records, delays pending records, and redacts private fields', async () => {
    const completed = await request(app.getHttpServer())
      .post('/api/farm-records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        fieldId,
        action: 'e2e auto fertilize',
        detail: { note: 'leaf feeding completed', cost: 999, labor: 8, material: 'internal formula' },
        images: ['https://cdn.example/e2e-farm.jpg'],
        location: '100.123456,25.123456',
        recordedAt: '2026-07-17T01:02:03.000Z',
        source: 'miniapp',
      })
      .expect(201);
    createdRecordIds.push(completed.body.id);

    const pending = await request(app.getHttpServer())
      .post('/api/farm-records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        fieldId,
        action: 'e2e pending weeding',
        detail: { desc: 'planned weeding', cost: 123 },
        recordedAt: '2026-07-17T02:02:03.000Z',
        source: 'web',
        status: 'pending',
      })
      .expect(201);
    createdRecordIds.push(pending.body.id);

    const before = await request(app.getHttpServer()).get(`/api/public/trace/${traceCode}`).expect(200);
    const completedEvent = before.body.events.find((event: any) => event.title === 'e2e auto fertilize');
    expect(completedEvent).toBeTruthy();
    expect(completedEvent.payload).toEqual({
      desc: 'leaf feeding completed',
      image: 'https://cdn.example/e2e-farm.jpg',
    });
    expect(before.body.events.some((event: any) => event.title === 'e2e pending weeding')).toBe(false);

    const publicJson = JSON.stringify(completedEvent);
    expect(publicJson).not.toContain(completed.body.id);
    expect(publicJson).not.toContain('999');
    expect(publicJson).not.toContain('labor');
    expect(publicJson).not.toContain('internal formula');
    expect(publicJson).not.toContain('100.123456');

    await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/farm-records/${pending.body.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200),
      request(app.getHttpServer())
        .patch(`/api/farm-records/${pending.body.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200),
    ]);

    const after = await request(app.getHttpServer()).get(`/api/public/trace/${traceCode}`).expect(200);
    expect(after.body.events.filter((event: any) => event.title === 'e2e pending weeding')).toHaveLength(1);
    expect(await prisma.traceEvent.count({ where: { sourceFarmRecordId: pending.body.id } })).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/farm-records/${completed.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending' })
      .expect(400);
  });
});
