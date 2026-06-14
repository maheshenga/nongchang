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

describe('POST /api/ai/transcribe(讯飞语音转写)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    merchantToken = await login(app, 'merchantA');
    // 确保该租户未配置讯飞,走未配置分支
    await prisma.integrationConfig.deleteMany({ where: { provider: 'xfyun' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('未带 token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/ai/transcribe')
      .attach('file', Buffer.from('1234'), { filename: 'a.pcm', contentType: 'application/octet-stream' })
      .expect(401);
  });

  it('带 token 但缺少音频文件 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai/transcribe')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(400);
  });

  it('带 token + 音频,但未配置讯飞 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai/transcribe')
      .set('Authorization', `Bearer ${merchantToken}`)
      .attach('file', Buffer.from('1234'), { filename: 'a.pcm', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
  });
});
