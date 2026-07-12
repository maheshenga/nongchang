import { describe, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { configureTrustedProxy } from '../src/common/network/trusted-proxy';

// 验证 ThrottlerGuard 接线正确:超过阈值返回 429。
// 用一个独立的小模块把阈值压到 3,确认限流真实生效(全局 app.module 在 test 环境放高阈值,
// 这里单独验证守卫机制本身)。
@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('限流守卫 (ThrottlerGuard)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
      controllers: [PingController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = mod.createNestApplication();
    configureTrustedProxy(app, 1);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('阈值内放行,超过阈值返回 429', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).get('/ping').expect(200);
    }
    // 第 4 次超过 limit=3,应被限流。
    await request(server).get('/ping').expect(429);
  });

  it('keeps separate rate-limit buckets for clients behind one trusted proxy', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).get('/ping').set('X-Forwarded-For', '203.0.113.10').expect(200);
      await request(server).get('/ping').set('X-Forwarded-For', '203.0.113.11').expect(200);
    }
    await request(server).get('/ping').set('X-Forwarded-For', '203.0.113.10').expect(429);
    await request(server).get('/ping').set('X-Forwarded-For', '203.0.113.11').expect(429);
  });
});
