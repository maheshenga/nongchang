import { UnauthorizedException } from '@nestjs/common';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginDto } from '@nongchang/shared';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthController } from './auth.controller';

const tokenPair = { accessToken: 'access.token', refreshToken: 'refresh.token' };
const loginDto: LoginDto = { tenantCode: 'demo', username: 'admin', password: 'secret1' };

describe('AuthController web sessions', () => {
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
    loginMiniapp: vi.fn(),
    loginWechatMiniapp: vi.fn(),
    registerWechatMiniapp: vi.fn(),
  };
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  let controller: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    auth.login.mockResolvedValue(tokenPair);
    auth.refresh.mockResolvedValue(tokenPair);
    auth.loginMiniapp.mockResolvedValue(tokenPair);
    auth.loginWechatMiniapp.mockResolvedValue(tokenPair);
    auth.registerWechatMiniapp.mockResolvedValue({ applicationId: 'newu', status: 'pending' });
    controller = new AuthController(auth as never);
  });

  it('logs the web client in without exposing the refresh token', async () => {
    const result = await controller.webLogin(loginDto, response as never);

    expect(auth.login).toHaveBeenCalledWith(loginDto);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly'),
    );
    expect(result).toEqual({ accessToken: 'access.token' });
    expect(result).not.toHaveProperty('refreshToken');
  });

  it('rotates the web cookie and only returns the new access token', async () => {
    const request = { headers: { cookie: 'theme=dark; nc_refresh=old.refresh' } };
    const result = await controller.webRefresh(request as never, response as never);

    expect(auth.refresh).toHaveBeenCalledWith('old.refresh');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly'),
    );
    expect(result).toEqual({ accessToken: 'access.token' });
    expect(result).not.toHaveProperty('refreshToken');
  });

  it('rejects refresh when the HttpOnly cookie is absent', async () => {
    await expect(controller.webRefresh({ headers: {} } as never, response as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('logs out by expiring the cookie and returning no body', () => {
    const result = controller.webLogout(response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=; Path=/api/auth/web; HttpOnly'),
    );
    expect(result).toBeUndefined();
  });

  it('discovers no anonymous web session as 204 without refreshing', async () => {
    const result = await controller.webSession({ headers: {} } as never, response as never);

    expect(result).toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(204);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('discovers and rotates a valid web session cookie', async () => {
    const request = { headers: { cookie: 'nc_refresh=old.refresh' } };

    await expect(controller.webSession(request as never, response as never)).resolves.toEqual({
      accessToken: 'access.token',
    });
    expect(auth.refresh).toHaveBeenCalledWith('old.refresh');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly'),
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.webSession)).toBe(true);
    expect(Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`, AuthController.prototype.webSession,
    )).toBe(process.env.NODE_ENV === 'test' ? 100_000 : 10);
  });

  it('forwards publication IDs through every dedicated miniapp auth route', async () => {
    const publicationId = '22222222-2222-4222-8222-222222222222';
    const passwordInput = { ...loginDto, publicationId };
    const wechatInput = { appId: 'wxX', code: 'fresh-code', publicationId };
    const registerInput = {
      ...wechatInput,
      displayName: '示例农户',
      phone: '13800001111',
    };

    await expect(controller.loginMiniapp(passwordInput)).resolves.toEqual(tokenPair);
    await expect(controller.loginWechatMiniapp(wechatInput)).resolves.toEqual(tokenPair);
    await expect(controller.registerWechatMiniapp(registerInput)).resolves.toEqual({
      applicationId: 'newu',
      status: 'pending',
    });
    expect(auth.loginMiniapp).toHaveBeenCalledWith(passwordInput);
    expect(auth.loginWechatMiniapp).toHaveBeenCalledWith(wechatInput);
    expect(auth.registerWechatMiniapp).toHaveBeenCalledWith(registerInput);
  });

  it('keeps every miniapp auth route public and credential-throttled', () => {
    const handlers = [
      AuthController.prototype.loginMiniapp,
      AuthController.prototype.loginWechatMiniapp,
      AuthController.prototype.registerWechatMiniapp,
    ];
    for (const handler of handlers) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(
        process.env.NODE_ENV === 'test' ? 100_000 : 10,
      );
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
    }
  });
});
