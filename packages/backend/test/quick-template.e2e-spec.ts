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

describe('快捷模板 e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sysToken: string;
  let merchantToken: string;
  let createdId: string | undefined;

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
    if (createdId) await prisma.quickTemplate.deleteMany({ where: { id: createdId } });
    await app.close();
  });

  it('merchant 可读模板列表 → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/quick-templates')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('merchant 不可创建模板 → 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/quick-templates')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ name: '浇水', action: '浇水' });
    expect(res.status).toBe(403);
  });

  it('sysadmin 创建/更新/删除模板全链路', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/quick-templates')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ name: '追肥', action: '施肥', note: '尿素', cost: 50, labor: 1 });
    expect(createRes.status).toBe(201);
    createdId = createRes.body.id;
    expect(createRes.body.action).toBe('施肥');
    expect(createRes.body.note).toBe('尿素');

    const listRes = await request(app.getHttpServer())
      .get('/api/quick-templates')
      .set('Authorization', `Bearer ${sysToken}`);
    expect(listRes.body.some((t: any) => t.id === createdId)).toBe(true);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/quick-templates/${createdId}`)
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ name: '追肥2', action: '滴灌施肥' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.action).toBe('滴灌施肥');

    const delRes = await request(app.getHttpServer())
      .delete(`/api/quick-templates/${createdId}`)
      .set('Authorization', `Bearer ${sysToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const gone = await prisma.quickTemplate.findUnique({ where: { id: createdId } });
    expect(gone).toBeNull();
    createdId = undefined;
  });
});
