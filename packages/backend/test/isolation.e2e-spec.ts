import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: INestApplication;

async function token(username: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ username, password: 'password123' });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('多租户/代理商数据隔离', () => {
  it('未带 token 访问受保护路由返回 401', async () => {
    await request(app.getHttpServer()).get('/api/agents/merchants').expect(401);
  });

  it('merchant 无权创建代理商(403)', async () => {
    const t = await token('merchantA');
    await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${t}`)
      .send({ name: 'x', region: 'y' }).expect(403);
  });

  it('agentA 只能看到自己旗下的 merchant,看不到 agentB 的', async () => {
    const t = await token('agentA');
    const res = await request(app.getHttpServer())
      .get('/api/agents/merchants').set('Authorization', `Bearer ${t}`).expect(200);
    const names = res.body.map((m: any) => m.displayName);
    expect(names).toContain('大理基地');
    expect(names).not.toContain('上海基地');
  });

  it('agentA 列出地块时看不到 agentB 旗下 merchant 的地块', async () => {
    const t = await token('agentA');
    const res = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${t}`).expect(200);
    const names = res.body.map((f: any) => f.name);
    expect(names).toContain('A区露地');
    expect(names).not.toContain('B区大棚');
  });

  it('system_admin 能看到全部 merchant', async () => {
    const t = await token('sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/agents/merchants').set('Authorization', `Bearer ${t}`).expect(200);
    const names = res.body.map((m: any) => m.displayName);
    expect(names).toContain('大理基地');
    expect(names).toContain('上海基地');
  });
});
