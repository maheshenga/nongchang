import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: INestApplication;

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
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
    const times = res.body.events.map((e: any) => e.occurredAt);
    expect(times).toEqual([...times].sort());
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

  it('响应体不泄露任何敏感字段', async () => {
    const res = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('ownerId');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('batchId');
  });
});
