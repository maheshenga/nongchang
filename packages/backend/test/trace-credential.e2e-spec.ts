import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
  if (errors.length) throw new AggregateError(errors, 'Trace credential e2e cleanup failed');
}

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantCode: 'DEMO', username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

describe('TraceCredential e2e', () => {
  const previousOssBaseUrl = process.env.OSS_BASE_URL;
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let batchAId: string;
  let tenantAId: string;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const scanCode = `CRED-E2E-${runId}`;
  const certificateSerialNo = `LB-${runId}`;
  const reportSerialNo = `JC-${runId}`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    process.env.OSS_BASE_URL = 'https://example.com';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    tokenA = await login(app, 'merchantA');
    tokenB = await login(app, 'merchantB');
    const demoTenant = await prisma.tenant.findUnique({ where: { code: 'DEMO' } });
    const userA = await prisma.user.findUnique({
      where: { tenantId_username: { tenantId: demoTenant!.id, username: 'merchantA' } },
    });
    const batchA = await prisma.batch.findFirst({ where: { tenantId: demoTenant!.id, ownerId: userA!.id } });
    batchAId = batchA!.id;
    tenantAId = batchA!.tenantId;
    // 专属溯源码,避免与 anti-fake e2e 并发冻结/解冻 ORC-DEMO0001 竞争。
    await prisma.traceCode.create({ data: { tenantId: tenantAId, batchId: batchAId, code: scanCode } });
  });

  afterAll(async () => {
    await runCleanupSteps([
      ['credentials', async () => {
        const credentialIds = createdIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (credentialIds.length) {
          await prisma.traceCredential.deleteMany({ where: { id: { in: credentialIds } } });
        }
      }],
      ['trace scans', () => prisma.traceScan.deleteMany({ where: { code: scanCode } })],
      ['trace code', () => prisma.traceCode.deleteMany({ where: { code: scanCode } })],
      ['app close', () => app.close()],
      ['restore OSS_BASE_URL', () => {
        if (previousOssBaseUrl === undefined) delete process.env.OSS_BASE_URL;
        else process.env.OSS_BASE_URL = previousOssBaseUrl;
      }],
    ]);
  });

  it('新增 → 列表返回(含 issuedAt ISO),删除生效', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/trace/credentials').set('Authorization', `Bearer ${tokenA}`)
      .send({
        batchId: batchAId, type: 'certificate', title: 'e2e绿色食品认证',
        issuer: '中国绿色食品发展中心', serialNo: certificateSerialNo,
        issuedAt: '2026-01-10T00:00:00.000Z',
        fileUrl: 'https://example.com/cert.pdf',
      });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(typeof id).toBe('string');
    expect(id).not.toHaveLength(0);
    createdIds.push(id);
    expect(create.body.type).toBe('certificate');
    expect(create.body.issuedAt).toBe('2026-01-10T00:00:00.000Z');

    const list = await request(app.getHttpServer())
      .get(`/api/trace/credentials?batchId=${batchAId}`).set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(list.body.find((c: any) => c.id === id)).toBeTruthy();

    const del = await request(app.getHttpServer())
      .delete(`/api/trace/credentials/${id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(200);
    createdIds.splice(createdIds.indexOf(id), 1);
    const after = await prisma.traceCredential.findUnique({ where: { id } });
    expect(after).toBeNull();
  });

  it('作用域隔离:merchantB 不能为 A 的批次新增/查看', async () => {
    const createB = await request(app.getHttpServer())
      .post('/api/trace/credentials').set('Authorization', `Bearer ${tokenB}`)
      .send({
        batchId: batchAId, type: 'report', title: '越权检测报告',
        issuer: '某机构', fileUrl: 'https://example.com/r.pdf',
      });
    expect(createB.status).toBe(403);

    const listB = await request(app.getHttpServer())
      .get(`/api/trace/credentials?batchId=${batchAId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(listB.status).toBe(403);
  });

  it('公开扫码页返回脱敏背书(无 id/serialNo/tenantId)', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/trace/credentials').set('Authorization', `Bearer ${tokenA}`)
      .send({
        batchId: batchAId, type: 'report', title: 'e2e农残检测报告',
        issuer: '云南省检测院', serialNo: reportSerialNo,
        issuedAt: '2026-02-20T00:00:00.000Z',
        fileUrl: 'https://example.com/report.pdf',
      });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(typeof id).toBe('string');
    expect(id).not.toHaveLength(0);
    createdIds.push(id);

    const scan = await request(app.getHttpServer())
      .get(`/api/public/trace/${scanCode}`).expect(200);
    const found = (scan.body.credentials ?? []).find((c: any) => c.title === 'e2e农残检测报告');
    expect(found).toBeTruthy();
    expect(found.type).toBe('report');
    expect(found.issuer).toBe('云南省检测院');
    expect(found.issuedAt).toBe('2026-02-20T00:00:00.000Z');
    expect(found.fileUrl).toBe('https://example.com/report.pdf');
    expect(found).not.toHaveProperty('id');
    const json = JSON.stringify(found);
    expect(json).not.toContain('serialNo');
    expect(json).not.toContain(reportSerialNo);
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('batchId');
  });
});
