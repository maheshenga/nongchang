import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_HOOK_TIMEOUT_MS = 30_000;

type CleanupStep = readonly [string, () => Promise<unknown> | unknown];

async function runCleanupSteps(steps: CleanupStep[]): Promise<void> {
  const errors: Error[] = [];
  for (const [name, cleanup] of steps) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Farm record publication e2e cleanup failed');
}

function requireFixtureId(value: unknown, label: string): string {
  expect(typeof value).toBe('string');
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function validFixtureIds(ids: Array<string | undefined>): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

describe('Farm record automatic public trace e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let systemToken: string;
  let batchId: string;
  let fieldId: string;
  let fieldName: string;
  let merchantDisplayName: string;
  let tenantId: string;
  let code: string | undefined;
  let pendingRecordId: string | undefined;
  let completedRecordId: string | undefined;
  let merchantId: string | undefined;
  let originalGroupId: string | null | undefined;
  let testGroupId: string | undefined;
  const createdRecordIds: string[] = [];
  const dedicatedBatchIds: string[] = [];
  const dedicatedFieldIds: string[] = [];
  const dedicatedUserIds: string[] = [];
  const dedicatedTenantIds: string[] = [];

  const completedAction = `e2e-auto-publish-fertilize-${randomUUID()}`;
  const pendingAction = `e2e-pending-weed-${randomUUID()}`;
  const inconsistentAction = `e2e-inconsistent-pending-${randomUUID()}`;
  const raceAction = `e2e-completion-delete-race-${randomUUID()}`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    tenantId = requireFixtureId(tenant.id, 'tenant id');
    const merchant = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId: tenant.id, username: 'merchantA' } },
    });
    merchantId = requireFixtureId(merchant.id, 'merchant id');
    merchantDisplayName = merchant.displayName;
    originalGroupId = merchant.groupId;

    const batch = await prisma.batch.findFirstOrThrow({
      where: { tenantId: tenant.id, ownerId: merchant.id },
      include: { field: { select: { name: true } } },
    });
    batchId = requireFixtureId(batch.id, 'batch id');
    fieldId = requireFixtureId(batch.fieldId, 'field id');
    fieldName = batch.field.name;

    const group = await prisma.userGroup.create({
      data: {
        tenantId: tenant.id,
        name: `e2e-auto-publication-${randomUUID()}`,
        isDefault: false,
        permissions: ['record:create', 'record:view', 'field:view', 'batch:view', 'trace:view'],
      },
    });
    testGroupId = requireFixtureId(group.id, 'test group id');
    await prisma.user.update({ where: { id: merchant.id }, data: { groupId: group.id } });

    token = (await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantCode: 'DEMO', username: 'merchantA', password: 'password123',
    }).expect(201)).body.accessToken;
    systemToken = (await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantCode: 'DEMO', username: 'sysadmin', password: 'password123',
    }).expect(201)).body.accessToken;

    code = `E2E-FARM-PUB-${randomUUID()}`;
    await prisma.traceCode.create({ data: { tenantId: merchant.tenantId, batchId, code } });
  }, E2E_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await runCleanupSteps([
      ['trace scans', async () => {
        if (prisma && code) await prisma.traceScan.deleteMany({ where: { code } });
      }],
      ['trace codes', async () => {
        if (prisma && code) await prisma.traceCode.deleteMany({ where: { code } });
      }],
      ['linked trace events', async () => {
        if (!prisma) return;
        const recordIds = validFixtureIds(createdRecordIds);
        const batchIds = validFixtureIds(dedicatedBatchIds);
        const where = [
          ...(recordIds.length ? [{ sourceFarmRecordId: { in: recordIds } }] : []),
          ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
        ];
        if (where.length) await prisma.traceEvent.deleteMany({ where: { OR: where } });
      }],
      ['farm record fixtures', async () => {
        if (!prisma) return;
        const recordIds = validFixtureIds(createdRecordIds);
        const batchIds = validFixtureIds(dedicatedBatchIds);
        const where = [
          ...(recordIds.length ? [{ id: { in: recordIds } }] : []),
          ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
        ];
        if (where.length) await prisma.farmRecord.deleteMany({ where: { OR: where } });
      }],
      ['dedicated batch fixtures', async () => {
        if (!prisma) return;
        const ids = validFixtureIds(dedicatedBatchIds);
        if (ids.length) await prisma.batch.deleteMany({ where: { id: { in: ids } } });
      }],
      ['dedicated field fixtures', async () => {
        if (!prisma) return;
        const ids = validFixtureIds(dedicatedFieldIds);
        if (ids.length) await prisma.field.deleteMany({ where: { id: { in: ids } } });
      }],
      ['restore merchant group', async () => {
        if (prisma && merchantId && originalGroupId !== undefined) {
          await prisma.user.update({ where: { id: merchantId }, data: { groupId: originalGroupId } });
        }
      }],
      ['delete unique group', async () => {
        if (prisma && testGroupId) await prisma.userGroup.deleteMany({ where: { id: testGroupId } });
      }],
      ['dedicated user fixtures', async () => {
        if (!prisma) return;
        const ids = validFixtureIds(dedicatedUserIds);
        if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }],
      ['dedicated tenant fixtures', async () => {
        if (!prisma) return;
        const ids = validFixtureIds(dedicatedTenantIds);
        if (ids.length) await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
      }],
      ['app close', async () => {
        if (app) await app.close();
      }],
    ]);
  }, E2E_HOOK_TIMEOUT_MS);

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
    completedRecordId = requireFixtureId(completed.body.id, 'completed record id');
    createdRecordIds.push(completedRecordId);

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
    pendingRecordId = requireFixtureId(pending.body.id, 'pending record id');
    createdRecordIds.push(pendingRecordId);

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

  it('fails closed when an independent owner relation drifts across tenants', async () => {
    const driftTenant = await prisma.tenant.create({
      data: {
        name: `Farm publication drift tenant ${randomUUID()}`,
        code: `FARM-PUB-DRIFT-${randomUUID()}`,
      },
    });
    const driftTenantId = requireFixtureId(driftTenant.id, 'drift tenant id');
    dedicatedTenantIds.push(driftTenantId);
    const owner = await prisma.user.create({
      data: {
        tenantId,
        role: 'merchant',
        username: `farm-pub-owner-${randomUUID()}`,
        passwordHash: 'not-used-by-e2e',
        displayName: 'Farm publication drift owner',
      },
    });
    const ownerId = requireFixtureId(owner.id, 'drift owner id');
    dedicatedUserIds.push(ownerId);
    const field = await prisma.field.create({
      data: {
        tenantId,
        ownerId,
        name: 'Farm publication drift field',
        area: 1,
      },
    });
    const driftFieldId = requireFixtureId(field.id, 'drift field id');
    dedicatedFieldIds.push(driftFieldId);
    const batch = await prisma.batch.create({
      data: {
        tenantId,
        ownerId,
        fieldId: driftFieldId,
        batchNo: `E2E-DRIFT-${randomUUID()}`,
        cropName: 'e2e-drift-crop',
        plantDate: new Date('2026-07-01T00:00:00.000Z'),
        expectedHarvest: new Date('2026-12-01T00:00:00.000Z'),
        status: 'growing',
      },
    });
    const driftBatchId = requireFixtureId(batch.id, 'drift batch id');
    dedicatedBatchIds.push(driftBatchId);
    const inconsistent = await prisma.farmRecord.create({
      data: {
        tenantId,
        batchId: driftBatchId,
        fieldId: driftFieldId,
        operatorId: merchantId!,
        action: inconsistentAction,
        recordedAt: new Date('2026-07-17T03:02:03.000Z'),
        source: 'web',
        status: 'pending',
      },
    });
    const inconsistentRecordId = requireFixtureId(inconsistent.id, 'inconsistent record id');
    createdRecordIds.push(inconsistentRecordId);
    await prisma.user.update({ where: { id: ownerId }, data: { tenantId: driftTenantId } });

    await request(app.getHttpServer())
      .patch(`/api/farm-records/${inconsistentRecordId}/status`)
      .set('Authorization', `Bearer ${systemToken}`)
      .send({ status: 'completed' })
      .expect(403);

    const after = await prisma.farmRecord.findUniqueOrThrow({ where: { id: inconsistentRecordId } });
    expect(after.status).toBe('pending');
    expect(await prisma.traceEvent.count({ where: { sourceFarmRecordId: inconsistentRecordId } })).toBe(0);
  });

  it('races completion with force deletion without deadlock or inconsistent residue', async () => {
    const raceBatch = await prisma.batch.create({
      data: {
        tenantId,
        ownerId: merchantId!,
        fieldId,
        batchNo: `E2E-RACE-${randomUUID()}`,
        cropName: 'e2e-race-crop',
        plantDate: new Date('2026-07-01T00:00:00.000Z'),
        expectedHarvest: new Date('2026-12-01T00:00:00.000Z'),
        status: 'growing',
      },
    });
    const raceBatchId = requireFixtureId(raceBatch.id, 'race batch id');
    dedicatedBatchIds.push(raceBatchId);
    const raceRecord = await prisma.farmRecord.create({
      data: {
        tenantId,
        batchId: raceBatchId,
        fieldId,
        operatorId: merchantId!,
        action: raceAction,
        recordedAt: new Date('2026-07-17T04:02:03.000Z'),
        source: 'web',
        status: 'pending',
      },
    });
    const raceRecordId = requireFixtureId(raceRecord.id, 'race record id');
    createdRecordIds.push(raceRecordId);

    const [completion, deletion] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/farm-records/${raceRecordId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' }),
      request(app.getHttpServer())
        .delete(`/api/batches/${raceBatchId}?force=true`)
        .set('Authorization', `Bearer ${token}`),
    ]);

    expect([200, 403]).toContain(completion.status);
    expect(deletion.status).toBe(200);
    expect(completion.status).not.toBe(500);
    expect(deletion.status).not.toBe(500);
    expect(await prisma.batch.findUnique({ where: { id: raceBatchId } })).toBeNull();
    expect(await prisma.farmRecord.findUnique({ where: { id: raceRecordId } })).toBeNull();
    expect(await prisma.traceEvent.count({ where: { sourceFarmRecordId: raceRecordId } })).toBe(0);
  });
});
