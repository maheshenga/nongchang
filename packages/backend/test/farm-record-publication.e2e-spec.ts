import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Farm record automatic public trace e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let batchId: string;
  let fieldId: string;
  let fieldName: string;
  let merchantDisplayName: string;
  let code: string | undefined;
  let pendingRecordId: string | undefined;
  let completedRecordId: string | undefined;
  let merchantId: string | undefined;
  let originalGroupId: string | null | undefined;
  let testGroupId: string | undefined;

  const completedAction = `e2e-auto-publish-fertilize-${randomUUID()}`;
  const pendingAction = `e2e-pending-weed-${randomUUID()}`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    const merchant = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId: tenant.id, username: 'merchantA' } },
    });
    merchantId = merchant.id;
    merchantDisplayName = merchant.displayName;
    originalGroupId = merchant.groupId;

    const batch = await prisma.batch.findFirstOrThrow({
      where: { tenantId: tenant.id, ownerId: merchant.id },
      include: { field: { select: { name: true } } },
    });
    batchId = batch.id;
    fieldId = batch.fieldId;
    fieldName = batch.field.name;

    const group = await prisma.userGroup.create({
      data: {
        tenantId: tenant.id,
        name: `e2e-auto-publication-${randomUUID()}`,
        isDefault: false,
        permissions: ['record:create', 'record:view', 'field:view', 'batch:view', 'trace:view'],
      },
    });
    testGroupId = group.id;
    await prisma.user.update({ where: { id: merchant.id }, data: { groupId: group.id } });

    token = (await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantCode: 'DEMO', username: 'merchantA', password: 'password123',
    }).expect(201)).body.accessToken;

    code = `E2E-${randomUUID()}`;
    await prisma.traceCode.create({ data: { tenantId: merchant.tenantId, batchId, code } });
  });

  afterAll(async () => {
    if (prisma) {
      if (code) {
        await prisma.traceScan.deleteMany({ where: { code } });
        await prisma.traceCode.deleteMany({ where: { code } });
      }

      const ids = [pendingRecordId, completedRecordId].filter((id): id is string => Boolean(id));
      if (ids.length) {
        await prisma.traceEvent.deleteMany({ where: { sourceFarmRecordId: { in: ids } } });
        await prisma.farmRecord.deleteMany({ where: { id: { in: ids } } });
      }

      if (merchantId) {
        await prisma.user.update({ where: { id: merchantId }, data: { groupId: originalGroupId ?? null } });
      }
      if (testGroupId) await prisma.userGroup.delete({ where: { id: testGroupId } });
    }
    if (app) await app.close();
  });

  it('publishes completed records, delays pending records, and never leaks private fields', async () => {
    const completed = await request(app.getHttpServer())
      .post('/api/farm-records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        fieldId,
        action: completedAction,
        detail: { note: 'leaf fertilization complete', cost: 999, labor: 8, material: 'private formula' },
        images: ['https://cdn.example/e2e-farm.jpg'],
        location: '100.123456,25.123456',
        recordedAt: '2026-07-17T01:02:03.000Z',
        source: 'miniapp',
      })
      .expect(201);
    completedRecordId = completed.body.id;

    const pending = await request(app.getHttpServer())
      .post('/api/farm-records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        fieldId,
        action: pendingAction,
        detail: { desc: 'planned weeding', cost: 123 },
        recordedAt: '2026-07-17T02:02:03.000Z',
        source: 'web',
        status: 'pending',
      })
      .expect(201);
    pendingRecordId = pending.body.id;

    const before = await request(app.getHttpServer()).get(`/api/public/trace/${code}`).expect(200);
    expect(before.body.events.some((event: any) => event.title === completedAction)).toBe(true);
    expect(before.body.events.some((event: any) => event.title === pendingAction)).toBe(false);

    const publishedEvent = before.body.events.find((event: any) => event.title === completedAction);
    expect(Object.keys(publishedEvent).sort()).toEqual([
      'actor', 'location', 'occurredAt', 'payload', 'title', 'type',
    ]);
    expect(publishedEvent).toStrictEqual({
      type: 'farm',
      title: completedAction,
      actor: merchantDisplayName,
      location: fieldName,
      occurredAt: '2026-07-17T01:02:03.000Z',
      payload: { desc: 'leaf fertilization complete', image: 'https://cdn.example/e2e-farm.jpg' },
    });
    expect(Object.keys(publishedEvent.payload).sort()).toEqual(['desc', 'image']);

    const publicJson = JSON.stringify(publishedEvent);
    expect(publicJson).toContain('leaf fertilization complete');
    expect(publicJson).toContain('e2e-farm.jpg');
    expect(publicJson).not.toContain(completedRecordId!);
    expect(publicJson).not.toContain('999');
    expect(publicJson).not.toContain('labor');
    expect(publicJson).not.toContain('private formula');
    expect(publicJson).not.toContain('100.123456');

    await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/farm-records/${pendingRecordId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200),
      request(app.getHttpServer())
        .patch(`/api/farm-records/${pendingRecordId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200),
    ]);

    const after = await request(app.getHttpServer()).get(`/api/public/trace/${code}`).expect(200);
    expect(after.body.events.filter((event: any) => event.title === pendingAction)).toHaveLength(1);
    expect(await prisma.traceEvent.count({ where: { sourceFarmRecordId: pendingRecordId } })).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/farm-records/${completedRecordId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending' })
      .expect(400);
  });
});
