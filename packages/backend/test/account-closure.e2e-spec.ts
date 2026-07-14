import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('account closure anonymization and session revocation e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let merchantId: string;
  let adminId: string;
  let fieldId: string;
  let accessToken: string;
  let refreshToken: string;
  let adminToken: string;
  const suffix = Date.now().toString(36).toUpperCase();
  const tenantCode = `CL${suffix}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 10);
    const tenant = await prisma.tenant.create({
      data: { code: tenantCode, name: '账户注销测试租户' },
    });
    tenantId = tenant.id;
    const merchant = await prisma.user.create({
      data: {
        tenantId,
        username: 'closureMerchant',
        passwordHash,
        role: 'merchant',
        displayName: '待注销基地',
        phone: '13900001111',
        status: 'active',
      },
    });
    merchantId = merchant.id;
    const admin = await prisma.user.create({
      data: {
        tenantId,
        username: 'closureAdmin',
        passwordHash,
        role: 'system_admin',
        displayName: '职责管理员',
        phone: '13900002222',
        status: 'active',
      },
    });
    adminId = admin.id;
    const field = await prisma.field.create({
      data: { tenantId, ownerId: merchantId, name: '注销后保留地块', area: 2.5 },
    });
    fieldId = field.id;

    const merchantLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantCode, username: 'closureMerchant', password: 'password123' })
      .expect(201);
    accessToken = merchantLogin.body.accessToken as string;
    refreshToken = merchantLogin.body.refreshToken as string;
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantCode, username: 'closureAdmin', password: 'password123' })
      .expect(201);
    adminToken = adminLogin.body.accessToken as string;
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      await prisma.field.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    if (app) await app.close();
  });

  it('rejects administrator self-closure without mutation', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/me/close')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        method: 'password',
        currentPassword: 'password123',
        confirmation: '注销账号',
      })
      .expect(403);

    await expect(prisma.user.findUniqueOrThrow({ where: { id: adminId } })).resolves.toMatchObject({
      status: 'active',
      username: 'closureAdmin',
      displayName: '职责管理员',
      phone: '13900002222',
      sessionVersion: 0,
    });
  });

  it('anonymizes the merchant, retains ownership history, and rejects both old tokens', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/me/close')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        method: 'password',
        currentPassword: 'password123',
        confirmation: '注销账号',
      })
      .expect(204);

    const closed = await prisma.user.findUniqueOrThrow({ where: { id: merchantId } });
    expect(closed).toMatchObject({
      id: merchantId,
      tenantId,
      role: 'merchant',
      agentId: null,
      status: 'deleted',
      username: `deleted_${merchantId}`,
      displayName: '已注销用户',
      phone: null,
      wxOpenid: null,
      groupId: null,
      sessionVersion: 1,
    });
    expect(await bcrypt.compare('password123', closed.passwordHash)).toBe(false);
    await expect(prisma.field.findUniqueOrThrow({ where: { id: fieldId } })).resolves.toMatchObject({
      tenantId,
      ownerId: merchantId,
      name: '注销后保留地块',
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
