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

describe('溯源码批量生成 POST /trace/codes/:batchId e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantAToken: string;
  let merchantBToken: string;
  let batchAId: string;
  const createdCodes: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    merchantAToken = await login(app, 'merchantA');
    merchantBToken = await login(app, 'merchantB');
    // merchantA 名下的种子批次(按归属过滤,避免选中其它 e2e 残留批次导致越权 403)。
    const userA = await prisma.user.findFirst({ where: { username: 'merchantA' } });
    const batch = await prisma.batch.findFirst({ where: { ownerId: userA!.id }, orderBy: { createdAt: 'asc' } });
    batchAId = batch!.id;
  });

  afterAll(async () => {
    if (createdCodes.length) await prisma.traceCode.deleteMany({ where: { code: { in: createdCodes } } });
    await app.close();
  });

  it('merchantA 为自家批次批量生成 N 个唯一码 → 列表长度匹配', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchAId}?count=3`)
      .set('Authorization', `Bearer ${merchantAToken}`)
      .set('Idempotency-Key', `trace-codes-e2e-batch-${Date.now()}`);
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    const codes = res.body.map((c: any) => c.code);
    res.body.forEach((c: any) => createdCodes.push(c.code));
    expect(new Set(codes).size).toBe(3);
    codes.forEach((c: string) => expect(c).toMatch(/^ORC-/));
  });

  it('生成的码可经公开溯源查到(扫码闭环) → 200', async () => {
    const code = createdCodes[0];
    const res = await request(app.getHttpServer()).get(`/api/public/trace/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(code);
  });

  it('merchantB 为他人批次生成 → 403(越权拒绝)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchAId}?count=2`)
      .set('Authorization', `Bearer ${merchantBToken}`)
      .set('Idempotency-Key', `trace-codes-e2e-forbidden-${Date.now()}`);
    expect(res.status).toBe(403);
  });

  it('missing Idempotency-Key returns 400 before charging', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchAId}?count=1`)
      .set('Authorization', `Bearer ${merchantAToken}`);
    expect(res.status).toBe(400);
  });

  it('count 缺省为 1', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trace/codes/${batchAId}`)
      .set('Authorization', `Bearer ${merchantAToken}`)
      .set('Idempotency-Key', `trace-codes-e2e-default-${Date.now()}`);
    expect(res.status).toBe(201);
    expect(res.body.length).toBe(1);
    createdCodes.push(res.body[0].code);
  });
});
