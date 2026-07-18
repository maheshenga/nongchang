import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginDto } from '@nongchang/shared';
import { AuthController } from './auth.controller';

const tokenPair = { accessToken: 'access.token', refreshToken: 'refresh.token' };
const loginDto: LoginDto = { tenantCode: 'demo', username: 'admin', password: 'secret1' };

function createResponse() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() };
}

describe('AuthController web sessions', () => {
  let auth: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    revokeWebSession: ReturnType<typeof vi.fn>;
  };
  let response: ReturnType<typeof createResponse>;
  let controller: AuthController;

  beforeEach(() => {
    auth = {
      login: vi.fn().mockResolvedValue(tokenPair),
      refresh: vi.fn().mockResolvedValue(tokenPair),
      revokeWebSession: vi.fn().mockResolvedValue(undefined),
    };
    response = createResponse();
    controller = new AuthController(auth as never);
  });

  it('returns only an access token and writes an HttpOnly refresh cookie on web login', async () => {
    const result = await controller.webLogin(loginDto, response as never);

    expect(auth.login).toHaveBeenCalledWith(loginDto, true);
    expect(result).toEqual({ accessToken: 'access.token' });
    expect(result).not.toHaveProperty('refreshToken');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=604800',
    );
  });

  it('rotates the refresh cookie from the named request cookie and returns only access', async () => {
    const result = await controller.webRefresh(
      { headers: { cookie: 'theme=dark; nc_refresh=old.refresh' } } as never,
      response as never,
    );

    expect(auth.refresh).toHaveBeenCalledWith('old.refresh', true);
    expect(result).toEqual({ accessToken: 'access.token' });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=604800',
    );
  });

  it('expires the cookie before rejecting a missing or malformed refresh cookie', async () => {
    await expect(controller.webRefresh({ headers: {} } as never, response as never)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.webRefresh({ headers: { cookie: 'nc_refresh=%' } } as never, response as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });

  it.each([
    new UnauthorizedException('invalid refresh'),
    new ForbiddenException('suspended account'),
  ])('expires the cookie when AuthService rejects with %s', async (error) => {
    auth.refresh.mockRejectedValueOnce(error);

    await expect(
      controller.webRefresh({ headers: { cookie: 'nc_refresh=stale.refresh' } } as never, response as never),
    ).rejects.toBe(error);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });

  it('revokes the web session, expires the cookie, and returns no body', async () => {
    const result = await controller.webLogout(
      { headers: { cookie: 'nc_refresh=old.refresh' } } as never,
      response as never,
    );

    expect(auth.revokeWebSession).toHaveBeenCalledWith('old.refresh');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    );
    expect(result).toBeUndefined();
  });

  it('does not attempt revocation when logout has no cookie', async () => {
    await controller.webLogout({ headers: {} } as never, response as never);
    expect(auth.revokeWebSession).not.toHaveBeenCalled();
  });
});
