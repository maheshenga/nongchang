import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: 'password123' })
    .expect(201);
  return res.body.accessToken;
}

describe('扫码回填 GET /batches/by-code/:code e2e', () => {
  let app: INestApplication;
  let merchantAToken: string;
  let merchantBToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    merchantAToken = await login(app, 'merchantA');
    merchantBToken = await login(app, 'merchantB');
  });

  afterAll(async () => { await app.close(); });

  it('merchantA 扫自己批次的溯源码 → 200 返回批次', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/batches/by-code/ORC-DEMO0001')
      .set('Authorization', `Bearer ${merchantAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.batchNo).toBeTruthy();
    expect(res.body.id).toBeTruthy();
  });

  it('扫不存在的溯源码 → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/batches/by-code/ORC-NOPE9999')
      .set('Authorization', `Bearer ${merchantAToken}`);
    expect(res.status).toBe(404);
  });

  it('merchantB 扫他人批次的溯源码 → 403(越权拒绝)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/batches/by-code/ORC-DEMO0001')
      .set('Authorization', `Bearer ${merchantBToken}`);
    expect(res.status).toBe(403);
  });

  it('无 token → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/batches/by-code/ORC-DEMO0001');
    expect(res.status).toBe(401);
  });
});
