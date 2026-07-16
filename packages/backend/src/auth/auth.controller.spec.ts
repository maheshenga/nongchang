import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginDto } from '@nongchang/shared';
import { AuthController } from './auth.controller';

const tokenPair = { accessToken: 'access.token', refreshToken: 'refresh.token' };
const loginDto: LoginDto = { tenantCode: 'demo', username: 'admin', password: 'secret1' };

describe('AuthController web sessions', () => {
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
    revokeWebSession: vi.fn(),
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
    auth.revokeWebSession.mockResolvedValue(undefined);
    controller = new AuthController(auth as never);
  });

  it('logs the web client in without exposing the refresh token', async () => {
    const result = await controller.webLogin(loginDto, response as never);

    expect(auth.login).toHaveBeenCalledWith(loginDto, true);
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

    expect(auth.refresh).toHaveBeenCalledWith('old.refresh', true);
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

  it('expires a malformed refresh cookie before rejecting it', async () => {
    await expect(
      controller.webRefresh({ headers: { cookie: 'nc_refresh=%' } } as never, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auth.refresh).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=; Path=/api/auth/web; HttpOnly'),
    );
  });

  it.each([
    new UnauthorizedException('invalid refresh'),
    new ForbiddenException('suspended account'),
  ])('expires the refresh cookie when AuthService rejects with %s', async (error) => {
    auth.refresh.mockRejectedValueOnce(error);

    await expect(
      controller.webRefresh({ headers: { cookie: 'nc_refresh=stale.refresh' } } as never, response as never),
    ).rejects.toBe(error);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=; Path=/api/auth/web; HttpOnly'),
    );
  });

  it('revokes the web session, expires the cookie, and returns no body', async () => {
    const result = await controller.webLogout({ headers: { cookie: 'nc_refresh=old.refresh' } } as never, response as never);

    expect(auth.revokeWebSession).toHaveBeenCalledWith('old.refresh');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('nc_refresh=; Path=/api/auth/web; HttpOnly'),
    );
    expect(result).toBeUndefined();
  });
});
