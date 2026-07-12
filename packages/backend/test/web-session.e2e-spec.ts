import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function cookieValue(setCookie: string[] | undefined, name: string): string | null {
  const row = setCookie?.find((cookie) => cookie.startsWith(`${name}=`));
  if (!row) return null;
  return row.slice(name.length + 1).split(';', 1)[0] || null;
}

describe('web HttpOnly session e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantCode: string;
  let userId: string;
  const username = `web_session_${randomUUID().slice(0, 8)}`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    tenantCode = tenant.code;
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'merchant',
        displayName: 'Web session E2E',
        status: 'active',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('logs in without exposing the refresh token and sets a strict HttpOnly cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/web/login')
      .send({ tenantCode, username, password })
      .expect(201);

    const setCookie = response.headers['set-cookie'] as string[] | undefined;
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toBeUndefined();
    expect(setCookie?.[0]).toContain('nc_refresh=');
    expect(setCookie?.[0]).toContain('HttpOnly');
    expect(setCookie?.[0]).toContain('SameSite=Strict');
    expect(setCookie?.[0]).toContain('Path=/api/auth/web');
  });

  it('refreshes and rotates the cookie, then logout expires it', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/web/login')
      .send({ tenantCode, username, password })
      .expect(201);
    const originalCookie = cookieValue(login.headers['set-cookie'] as string[] | undefined, 'nc_refresh');

    const refresh = await agent.post('/api/auth/web/refresh').expect(201);
    const rotatedCookie = cookieValue(refresh.headers['set-cookie'] as string[] | undefined, 'nc_refresh');
    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(refresh.body.refreshToken).toBeUndefined();
    expect(rotatedCookie).not.toBe(originalCookie);

    const logout = await agent.post('/api/auth/web/logout').expect(204);
    expect((logout.headers['set-cookie'] as string[] | undefined)?.[0]).toContain('Max-Age=0');
    await agent.post('/api/auth/web/refresh').expect(401);
  });

  it('rejects an old refresh cookie after a password change increments sessionVersion', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/web/login')
      .send({ tenantCode, username, password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/me/password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ oldPassword: password, newPassword: 'new-password-456' })
      .expect(201);

    await agent.post('/api/auth/web/refresh').expect(401);
  });
});
