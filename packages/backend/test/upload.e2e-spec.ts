import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OssService } from '../src/modules/upload/oss.service';

let app: INestApplication;

async function token(username: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ username, password: 'password123' });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OssService)
    .useValue({ put: async (key: string) => `https://cdn.test/${key}` })
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('POST /api/uploads(受保护图片上传)', () => {
  it('未带 token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('带 token + 非图片类型 → 400', async () => {
    const t = await token('merchantA');
    await request(app.getHttpServer())
      .post('/api/uploads').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('带 token + 合法 jpg → 201 且返回 url', async () => {
    const t = await token('merchantA');
    const res = await request(app.getHttpServer())
      .post('/api/uploads').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from('fakejpeg'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body.url).toMatch(/^https:\/\/cdn\.test\/farm-records\/\d{6}\/[0-9a-f-]{36}\.jpg$/);
  });
});
