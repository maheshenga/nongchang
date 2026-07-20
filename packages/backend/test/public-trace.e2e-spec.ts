import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PublicTraceCacheService } from '../src/modules/public-trace/public-trace-cache.service';

let app: INestApplication;
let prisma: PrismaService;
let traceCache: PublicTraceCacheService;

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  prisma = app.get(PrismaService);
  traceCache = app.get(PublicTraceCacheService);
});
afterAll(async () => { await app.close(); });

describe('公开溯源接口(免登录)', () => {
  it('免登录可读真实链路,节点数与顺序正确', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/trace/ORC-DEMO0001').expect(200);
    expect(res.body.code).toBe('ORC-DEMO0001');
    expect(res.body.batch.cropName).toBe('极品春白芍大雪素');
    expect(res.body.batch.region).toBe('云南');
    expect(res.body.events.length).toBe(7);
    expect(res.body.events[0].type).toBe('origin');
    expect(res.body.events[6].type).toBe('retail');
    expect(res.body.eventTotal).toBeGreaterThanOrEqual(res.body.events.length);
    expect(res.body.credentialTotal).toBeGreaterThanOrEqual(res.body.credentials.length);
    const times = res.body.events.map((e: any) => e.occurredAt);
    expect(times).toEqual([...times].sort());
  });

  it('bounds event rows while returning the live total', async () => {
    const traceCode = await prisma.traceCode.findUniqueOrThrow({ where: { code: 'ORC-DEMO0001' } });
    const prefix = `bounded-${Date.now()}-`;
    const before = await prisma.traceEvent.count({ where: { tenantId: traceCode.tenantId, batchId: traceCode.batchId } });
    await prisma.traceEvent.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        tenantId: traceCode.tenantId,
        batchId: traceCode.batchId,
        type: 'farm',
        title: `${prefix}${index}`,
        actor: 'e2e',
        location: 'e2e',
        occurredAt: new Date(`2026-12-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`),
      })),
    });
    traceCache.invalidateBatch(traceCode.batchId);
    try {
      const res = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
      expect(res.body.events).toHaveLength(100);
      expect(res.body.eventTotal).toBe(before + 105);
    } finally {
      await prisma.traceEvent.deleteMany({ where: { title: { startsWith: prefix } } });
      traceCache.invalidateBatch(traceCode.batchId);
    }
  });

  it('不存在的 code 返回 404', async () => {
    await request(app.getHttpServer())
      .get('/api/public/trace/ORC-NOPE9999').expect(404);
  });

  it('连续两次请求 scanCount 递增', async () => {
    const r1 = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    const r2 = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    expect(r2.body.scanCount).toBe(r1.body.scanCount + 1);
  });

  it('一次公开扫码会让计数和明细同时增加', async () => {
    const code = `ORC-E2E-${Date.now()}`;
    const source = await prisma.traceCode.findUniqueOrThrow({ where: { code: 'ORC-DEMO0001' } });
    await prisma.traceCode.create({
      data: {
        tenantId: source.tenantId,
        batchId: source.batchId,
        code,
        status: 'active',
        scanCount: 0,
      },
    });
    try {
      const detailBefore = await prisma.traceScan.count({ where: { code } });
      const res = await request(app.getHttpServer())
        .get(`/api/public/trace/${code}`)
        .set('User-Agent', 'public-trace-atomicity-e2e')
        .expect(200);
      const [storedCode, detailAfter] = await Promise.all([
        prisma.traceCode.findUniqueOrThrow({ where: { code } }),
        prisma.traceScan.count({ where: { code } }),
      ]);
      expect(res.body.scanCount).toBe(1);
      expect(storedCode.scanCount).toBe(1);
      expect(detailAfter).toBe(detailBefore + 1);
    } finally {
      await prisma.traceScan.deleteMany({ where: { code } });
      await prisma.traceCode.delete({ where: { code } });
    }
  });

  it('响应体不泄露任何敏感字段', async () => {
    const res = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('ownerId');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('batchId');
  });
});
