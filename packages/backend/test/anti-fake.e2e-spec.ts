import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: INestApplication;

async function login(username: string, password = 'password123'): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password })
    .expect(201);
  return res.body.accessToken;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  // 幂等兜底:无论上面用例是否在 unfreeze 前失败,结束时确保 ORC-DEMO0001 回到 active,
  // 避免污染共享真实 PG 上的 public-trace e2e(它依赖该码为非冻结状态)。
  try {
    const token = await login('sysadmin');
    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/unfreeze')
      .set('Authorization', `Bearer ${token}`);
  } catch {
    /* 兜底失败不影响测试结论;此处仅尽力恢复状态 */
  }
  await app.close();
});

describe('防伪监控(受保护)+ 公开扫码落明细', () => {
  it('公开扫码后,sysadmin 能在 scans 列表看到该次明细', async () => {
    await request(app.getHttpServer())
      .get('/api/public/trace/ORC-DEMO0001')
      .expect(200);

    const token = await login('sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/anti-fake/scans?limit=50')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((s: { code: string }) => s.code === 'ORC-DEMO0001')).toBe(true);
  });

  it('未登录访问受保护端点返回 401', async () => {
    await request(app.getHttpServer())
      .get('/api/anti-fake/scans')
      .expect(401);
  });

  it('冻结后公开扫码返回 frozen 标志,解冻后恢复正常(自包含,结束回到 active)', async () => {
    const token = await login('sysadmin');

    // 冻结(@Post 无 body → Nest 默认 201)
    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/freeze')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const frozen = await request(app.getHttpServer())
      .get('/api/public/trace/ORC-DEMO0001')
      .expect(200);
    expect(frozen.body.frozen).toBe(true);
    expect(frozen.body.events).toBeUndefined();

    // 解冻,恢复正常
    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/unfreeze')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const normal = await request(app.getHttpServer())
      .get('/api/public/trace/ORC-DEMO0001')
      .expect(200);
    expect(normal.body.frozen).toBe(false);
    expect(normal.body.events.length).toBeGreaterThan(0);
  });

  it('跨作用域越权:merchantB 无法冻结归属 merchantA 的码(403)', async () => {
    // ORC-DEMO0001 → batchA → ownerId=merchantA(agentA)。
    // merchantB 归属 agentB,不在 merchantA 作用域内,freeze 应被 fail-closed 拒绝。
    const tokenB = await login('merchantB');
    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/freeze')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
  });
});
