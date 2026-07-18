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
  if (errors.length) throw new AggregateError(errors, 'AI provider e2e cleanup failed');
}

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantCode: 'DEMO', username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

describe('AiProvider e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let merchantToken: string;
  let providerTenantId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sysToken = await login(app, 'sysadmin');
    merchantToken = await login(app, 'merchantA');
    const tenant = await prisma.tenant.create({
      data: { name: `AI Provider E2E ${Date.now()}`, code: `AIPROV-E2E-${Date.now()}` },
    });
    providerTenantId = tenant.id;
  });

  afterAll(async () => {
    await runCleanupSteps([
      ['providers', async () => {
        if (createdIds.length) {
          await prisma.aiProvider.deleteMany({ where: { id: { in: createdIds } } });
        }
      }],
      ['tenant', () => prisma.tenant.deleteMany({ where: { id: providerTenantId } })],
      ['app close', () => app.close()],
    ]);
  });

  it('merchant 无权访问 AI 服务商管理端点 → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai-providers')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(403);
  });

  it('sysadmin 创建后 apiKey 脱敏返回,不泄露明文', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai-providers')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({
        name: 'e2e通义',
        baseUrl: 'https://x.com/v1',
        apiKey: 'sk-e2e-secret-7777',
        textModel: 'qwen-plus',
      });
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);
    expect(res.body.apiKeyMasked).toBe('****7777');
    expect(JSON.stringify(res.body)).not.toContain('sk-e2e-secret');
  });

  it('list 不返回明文 apiKey,仅脱敏', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai-providers')
      .set('Authorization', `Bearer ${sysToken}`);
    expect(res.status).toBe(200);
    const found = res.body.find((p: any) => p.id === createdIds[0]);
    expect(found).toBeDefined();
    expect(found.apiKeyMasked).toBe('****7777');
    expect(JSON.stringify(res.body)).not.toContain('sk-e2e-secret');
  });

  it('无启用 provider 时 chat → 400 业务降级', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ message: '你好' });
    expect(res.status).toBe(400);
  });

  it('billable AI endpoints require Idempotency-Key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ message: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Idempotency-Key/);
  });

  it('偏唯一索引:同租户第二条 enabled=true 被 DB 拒绝(根治并发双启)', async () => {
    // Use a suite-owned tenant to exercise the partial unique index against a valid FK.
    const base = {
      tenantId: providerTenantId,
      baseUrl: 'https://x.com/v1',
      apiKeyEnc: 'iv:tag:cipher',
      textModel: 'qwen-plus',
      enabled: true,
    };
    const first = await prisma.aiProvider.create({ data: { ...base, name: '启用A' } });
    createdIds.push(first.id);
    await expect(
      prisma.aiProvider.create({ data: { ...base, name: '启用B' } }),
    ).rejects.toMatchObject({ code: 'P2002', name: 'PrismaClientKnownRequestError' });
    // enabled=false 不受约束:同租户可任意多条
    const disabled = await prisma.aiProvider.create({
      data: { ...base, name: '停用C', enabled: false },
    });
    createdIds.push(disabled.id);
  });
});
