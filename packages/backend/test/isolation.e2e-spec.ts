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

describe('租户内跨 owner 越权(#23/#24)', () => {
  async function merchantABatchAndField() {
    const t = await token('merchantA');
    const batches = await request(app.getHttpServer())
      .get('/api/batches').set('Authorization', `Bearer ${t}`).expect(200);
    const fields = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${t}`).expect(200);
    return { batchId: batches.body[0].id, fieldId: fields.body[0].id };
  }

  it('merchantB 用 merchantA 的 batchId/fieldId 建农事记录 → 403', async () => {
    const { batchId, fieldId } = await merchantABatchAndField();
    const tB = await token('merchantB');
    await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${tB}`)
      .send({
        batchId, fieldId, action: '越权施肥',
        recordedAt: '2026-06-14T10:00:00.000Z', source: 'miniapp',
      }).expect(403);
  });

  it('merchantB 用 merchantA 的 batchId 列溯源事件 → 403', async () => {
    const { batchId } = await merchantABatchAndField();
    const tB = await token('merchantB');
    await request(app.getHttpServer())
      .get(`/api/trace/events/${batchId}`).set('Authorization', `Bearer ${tB}`)
      .expect(403);
  });

  it('merchant 建 batch 传他人 ownerId → 被强制为 self(记录归属 merchantB 自己)', async () => {
    const { fieldId } = await merchantABatchAndField(); // 仅借 fieldId 形态;下面用 merchantB 自己的 field
    const tB = await token('merchantB');
    const fieldsB = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${tB}`).expect(200);
    const ownFieldId = fieldsB.body[0].id;
    const res = await request(app.getHttpServer())
      .post('/api/batches').set('Authorization', `Bearer ${tB}`)
      .send({
        ownerId: '00000000-0000-0000-0000-000000000000', fieldId: ownFieldId,
        batchNo: `E2E-${Date.now()}`, cropName: '测试白芍',
        plantDate: '2026-01-01T00:00:00.000Z', expectedHarvest: '2026-06-01T00:00:00.000Z',
        status: 'Planting',
      }).expect(201);
    // ownerId 被强制覆盖为 merchantB 自身,绝不会是传入的全零 UUID
    expect(res.body.ownerId).not.toBe('00000000-0000-0000-0000-000000000000');
  });
});
