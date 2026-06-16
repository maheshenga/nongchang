import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: INestApplication;

async function token(username: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ tenantCode: 'DEMO', username, password: 'password123' });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('商户管理(create→initialPassword→PATCH→status)', () => {
  it('system_admin 创建商户返回 initialPassword,改名并停用', async () => {
    const t = await token('sysadmin');
    const created = await request(app.getHttpServer())
      .post('/api/users').set('Authorization', `Bearer ${t}`)
      .send({ username: 'm_e2e_' + Date.now(), role: 'merchant', displayName: '测试商户' })
      .expect(201);
    expect(typeof created.body.initialPassword).toBe('string');
    expect(created.body.initialPassword.length).toBeGreaterThan(0);
    const id = created.body.id as string;
    expect(typeof id).toBe('string');

    const patched = await request(app.getHttpServer())
      .patch(`/api/users/${id}`).set('Authorization', `Bearer ${t}`)
      .send({ displayName: '改名商户', phone: '13800000000' })
      .expect(200);
    expect(patched.body.displayName).toBe('改名商户');
    expect(patched.body.phone).toBe('13800000000');

    const status = await request(app.getHttpServer())
      .post(`/api/users/${id}/status`).set('Authorization', `Bearer ${t}`)
      .send({ status: 'suspended' })
      .expect(201);
    expect(status.body.status).toBe('suspended');
  });

  it('GET /api/users/merchants 返回数组且每行含 fieldCount/totalArea', async () => {
    const t = await token('sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/users/merchants').set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const row of res.body) {
      expect(row).toHaveProperty('fieldCount');
      expect(row).toHaveProperty('totalArea');
    }
  });
});

describe('代理商管理(CRUD + status)', () => {
  it('system_admin 创建代理商,列表含 merchantCount,改区域并停用', async () => {
    const t = await token('sysadmin');
    const created = await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${t}`)
      .send({ name: '代理_e2e_' + Date.now(), region: '华东' })
      .expect(201);
    const id = created.body.id as string;
    expect(typeof id).toBe('string');

    const list = await request(app.getHttpServer())
      .get('/api/agents').set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    const row = list.body.find((a: any) => a.id === id);
    expect(row).toBeDefined();
    expect(row).toHaveProperty('merchantCount');

    const patched = await request(app.getHttpServer())
      .patch(`/api/agents/${id}`).set('Authorization', `Bearer ${t}`)
      .send({ region: '华南' })
      .expect(200);
    expect(patched.body.region).toBe('华南');

    const status = await request(app.getHttpServer())
      .post(`/api/agents/${id}/status`).set('Authorization', `Bearer ${t}`)
      .send({ status: 'suspended' })
      .expect(201);
    expect(status.body.status).toBe('suspended');
  });
});

describe('越权(代理商管理仅 SYSTEM_ADMIN)', () => {
  it('agent_admin 创建代理商 → 403', async () => {
    const t = await token('agentA');
    await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${t}`)
      .send({ name: '越权代理_' + Date.now(), region: '华北' })
      .expect(403);
  });

  it('agent_admin PATCH 代理商 → 403', async () => {
    const t = await token('agentA');
    await request(app.getHttpServer())
      .patch('/api/agents/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${t}`)
      .send({ region: '华北' })
      .expect(403);
  });
});
