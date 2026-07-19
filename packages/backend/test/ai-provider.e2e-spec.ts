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

describe('AiProvider e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let merchantToken: string;
  let uniqueTenantId: string;
  const uniqueTenantCode = `AIP${Date.now()}`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sysToken = await login(app, 'sysadmin');
    merchantToken = await login(app, 'merchantA');
    const uniqueTenant = await prisma.tenant.create({
      data: { name: 'AI Provider e2e tenant', code: uniqueTenantCode },
    });
    uniqueTenantId = uniqueTenant.id;
  });

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.aiProvider.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (uniqueTenantId) {
      await prisma.tenant.deleteMany({ where: { id: uniqueTenantId } });
    }
    await app.close();
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

  it('偏唯一索引:同租户第二条 enabled=true 被 DB 拒绝(根治并发双启)', async () => {
    // 使用独立租户隔离测试数据，避免触碰 DEMO 租户现有服务商记录。
    const base = {
      tenantId: uniqueTenantId,
      baseUrl: 'https://x.com/v1',
      apiKeyEnc: 'iv:tag:cipher',
      textModel: 'qwen-plus',
      enabled: true,
    };
    const first = await prisma.aiProvider.create({ data: { ...base, name: '启用A' } });
    createdIds.push(first.id);
    await expect(
      prisma.aiProvider.create({ data: { ...base, name: '启用B' } }),
    ).rejects.toThrow(); // 偏唯一索引冲突(P2002)
    // enabled=false 不受约束:同租户可任意多条
    const disabled = await prisma.aiProvider.create({
      data: { ...base, name: '停用C', enabled: false },
    });
    createdIds.push(disabled.id);
  });
});
