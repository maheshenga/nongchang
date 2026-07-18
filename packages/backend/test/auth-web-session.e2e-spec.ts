import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

const loginDto = { tenantCode: 'tenant-a', username: 'farmer', password: 'password123' };
const tokenPair = { accessToken: 'access.token', refreshToken: 'refresh.token' };

describe('web auth session routes', () => {
  let app: INestApplication;
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    auth.login.mockReset().mockResolvedValue(tokenPair);
    auth.refresh.mockReset().mockResolvedValue(tokenPair);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the web login route under the API prefix with only an HttpOnly refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/web/login')
      .send(loginDto)
      .expect(201);

    expect(response.body).toEqual({ accessToken: 'access.token' });
    expect(response.headers['set-cookie']).toEqual([
      'nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=604800',
    ]);
  });

  it('keeps the legacy login and refresh routes returning a token pair for miniapp clients', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(loginDto)
      .expect(201, tokenPair);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'legacy.refresh.token' })
      .expect(201, tokenPair);

    expect(auth.refresh).toHaveBeenCalledWith('legacy.refresh.token');
  });

  it('expires a malformed refresh cookie at the HTTP boundary', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/web/refresh')
      .set('Cookie', 'nc_refresh=%')
      .expect(401);

    expect(response.headers['set-cookie']).toEqual([
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    ]);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('marks the web refresh cookie Secure when the controller runs in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send(loginDto)
        .expect(201);

      expect(response.headers['set-cookie']).toEqual([
        'nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly; Secure; SameSite=Strict; Max-Age=604800',
      ]);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
