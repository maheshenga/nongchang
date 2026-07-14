import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantCode: 'DEMO', username, password: 'password123' })
    .expect(201);
  return response.body.accessToken as string;
}

describe('legal miniapp authentication e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let merchantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    const merchant = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId: tenant.id, username: 'merchantA' } },
    });
    tenantId = tenant.id;
    merchantId = merchant.id;
    await clearLegalRows();
  });

  afterAll(async () => {
    if (prisma && tenantId) await clearLegalRows();
    if (app) await app.close();
  });

  async function clearLegalRows(): Promise<void> {
    await prisma.legalConsent.deleteMany({ where: { tenantId } });
    await prisma.legalSettings.deleteMany({ where: { tenantId } });
    await prisma.legalPublication.deleteMany({ where: { tenantId } });
  }

  it('enforces current immutable publication consent while preserving generic login', async () => {
    const sysToken = await login(app, 'sysadmin');
    const merchantToken = await login(app, 'merchantA');
    const effectiveDate = new Date().toISOString().slice(0, 10);
    const suffix = Date.now().toString(36);
    const firstDraft = {
      operatorName: '示例农业科技有限公司',
      contactAddress: '杭州市示例路 1 号',
      privacyContact: '数据保护负责人',
      contactPhone: '0571-12345678',
      contactEmail: null,
      privacyVersion: `privacy-${suffix}-1`,
      agreementVersion: `agreement-${suffix}-1`,
      effectiveDate,
      privacyPolicyText: '隐私政策正文内容。'.repeat(40),
      userAgreementText: '用户协议正文内容。'.repeat(40),
    };

    await request(app.getHttpServer())
      .get('/api/legal-settings')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .put('/api/legal-settings')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send(firstDraft)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/legal-settings/publish')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put('/api/legal-settings')
      .set('Authorization', `Bearer ${sysToken}`)
      .send(firstDraft)
      .expect(200);
    const firstPublication = await request(app.getHttpServer())
      .post('/api/legal-settings/publish')
      .set('Authorization', `Bearer ${sysToken}`)
      .expect(201);
    const firstPublicationId = firstPublication.body.id as string;
    expect(firstPublicationId).toBeTruthy();

    const miniappInput = {
      tenantCode: 'DEMO',
      username: 'merchantA',
      password: 'password123',
      publicationId: firstPublicationId,
    };
    await request(app.getHttpServer())
      .post('/api/auth/miniapp/login')
      .send(miniappInput)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/miniapp/login')
      .send(miniappInput)
      .expect(201);

    await expect(prisma.legalConsent.count({
      where: {
        tenantId,
        userId: merchantId,
        publicationId: firstPublicationId,
        client: 'miniapp',
      },
    })).resolves.toBe(1);

    const secondDraft = {
      ...firstDraft,
      privacyVersion: `privacy-${suffix}-2`,
      agreementVersion: `agreement-${suffix}-2`,
    };
    await request(app.getHttpServer())
      .put('/api/legal-settings')
      .set('Authorization', `Bearer ${sysToken}`)
      .send(secondDraft)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/legal-settings/publish')
      .set('Authorization', `Bearer ${sysToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/miniapp/login')
      .send(miniappInput)
      .expect(409);

    const genericLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantCode: 'DEMO', username: 'merchantA', password: 'password123' })
      .expect(201);
    expect(genericLogin.body.accessToken).toEqual(expect.any(String));
  });
});
