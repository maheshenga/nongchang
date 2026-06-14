import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

describe('AiProvider e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let merchantToken: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sysToken = await login(app, 'sysadmin');
    merchantToken = await login(app, 'merchantA');
  });

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.aiProvider.deleteMany({ where: { id: { in: createdIds } } });
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
});
