import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OssService } from '../src/modules/upload/oss.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadQuotaService } from '../src/modules/upload/upload-quota.service';

let app: INestApplication;
let prisma: PrismaService;
let quota: UploadQuotaService;
const createdAssetIds: string[] = [];

async function token(username: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ tenantCode: 'DEMO', username, password: 'password123' });
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
  prisma = app.get(PrismaService);
  quota = app.get(UploadQuotaService);
});
afterAll(async () => {
  for (const id of createdAssetIds) await quota.release(id, 'DELETED');
  await app.close();
});

describe('POST /api/uploads(受保护图片上传)', () => {
  it('未带 token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads?purpose=farm-record')
      .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('带 token + 非图片类型 → 400', async () => {
    const t = await token('merchantA');
    await request(app.getHttpServer())
      .post('/api/uploads?purpose=farm-record').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('带 token + 合法 jpg → 201 且返回 url', async () => {
    const t = await token('merchantA');
    const res = await request(app.getHttpServer())
      .post('/api/uploads?purpose=farm-record').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body.url).toMatch(/^https:\/\/cdn\.test\/tenants\/[^/]+\/farm-records\/\d{6}\/[0-9a-f-]{36}\.jpg$/);
    const objectKey = res.body.url.replace('https://cdn.test/', '');
    const asset = await prisma.uploadAsset.findUnique({ where: { objectKey } });
    expect(asset).toMatchObject({ status: 'ACTIVE', purpose: 'farm-record' });
    expect(asset?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(objectKey).toContain(`/tenants/${asset?.tenantId}/`.replace('/tenants', 'tenants'));
    createdAssetIds.push(asset!.id);
  });

  it('merchant may upload AI diagnosis images but may not upload credentials', async () => {
    const t = await token('merchantA');
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const ai = await request(app.getHttpServer())
      .post('/api/uploads?purpose=ai-diagnose').set('Authorization', `Bearer ${t}`)
      .attach('file', image, { filename: 'leaf.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(ai.body.url).toMatch(/^https:\/\/cdn\.test\/tenants\/[^/]+\/ai-diagnose\//);
    const aiAsset = await prisma.uploadAsset.findUnique({
      where: { objectKey: ai.body.url.replace('https://cdn.test/', '') },
    });
    createdAssetIds.push(aiAsset!.id);

    await request(app.getHttpServer())
      .post('/api/uploads?purpose=credential').set('Authorization', `Bearer ${t}`)
      .attach('file', image, { filename: 'credential.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('agent admin may upload credentials', async () => {
    const t = await token('agentA');
    const res = await request(app.getHttpServer())
      .post('/api/uploads?purpose=credential').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), { filename: 'credential.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(res.body.url).toMatch(/^https:\/\/cdn\.test\/tenants\/[^/]+\/credentials\//);
    const asset = await prisma.uploadAsset.findUnique({
      where: { objectKey: res.body.url.replace('https://cdn.test/', '') },
    });
    createdAssetIds.push(asset!.id);
  });

  it('returns stable 429 quota details after the daily budget is exhausted', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: 'merchantA' } });
    const usage = await prisma.uploadQuotaUsage.findUnique({ where: { tenantId: user.tenantId } });
    const today = new Date().toISOString().slice(0, 10);
    const used = usage?.dayKey === today ? usage.dailyBytes : 0n;
    const previous = process.env.UPLOAD_DAILY_BYTES_LIMIT;
    process.env.UPLOAD_DAILY_BYTES_LIMIT = String(used + 6n);
    const t = await token('merchantA');
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    try {
      const first = await request(app.getHttpServer())
        .post('/api/uploads?purpose=ai-diagnose').set('Authorization', `Bearer ${t}`)
        .attach('file', image, { filename: 'quota-a.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const asset = await prisma.uploadAsset.findUniqueOrThrow({
        where: { objectKey: first.body.url.replace('https://cdn.test/', '') },
      });
      createdAssetIds.push(asset.id);

      const rejected = await request(app.getHttpServer())
        .post('/api/uploads?purpose=ai-diagnose').set('Authorization', `Bearer ${t}`)
        .attach('file', image, { filename: 'quota-b.jpg', contentType: 'image/jpeg' })
        .expect(429);
      expect(rejected.body).toMatchObject({ code: 'UPLOAD_QUOTA_EXCEEDED', scope: 'daily' });
    } finally {
      if (previous === undefined) delete process.env.UPLOAD_DAILY_BYTES_LIMIT;
      else process.env.UPLOAD_DAILY_BYTES_LIMIT = previous;
    }
  });
});
