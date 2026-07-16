import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

const loginDto = { tenantCode: 'tenant-a', username: 'farmer', password: 'password123' };
const tokenPair = { accessToken: 'access.token', refreshToken: 'refresh.token' };

function createResponse() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() };
}

describe('AuthController web sessions', () => {
  it('returns only an access token and writes an HttpOnly refresh cookie on web login', async () => {
    const auth = { login: vi.fn().mockResolvedValue(tokenPair) };
    const response = createResponse();
    const controller = new AuthController(auth as never);

    const result = await (controller as any).webLogin(loginDto, response);

    expect(auth.login).toHaveBeenCalledWith(loginDto);
    expect(result).toEqual({ accessToken: 'access.token' });
    expect(result).not.toHaveProperty('refreshToken');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=604800',
    );
  });

  it('rotates the refresh cookie from the named request cookie and returns only access', async () => {
    const auth = { refresh: vi.fn().mockResolvedValue(tokenPair) };
    const response = createResponse();
    const controller = new AuthController(auth as never);

    const result = await (controller as any).webRefresh({ headers: { cookie: 'theme=dark; nc_refresh=old.refresh' } }, response);

    expect(auth.refresh).toHaveBeenCalledWith('old.refresh');
    expect(result).toEqual({ accessToken: 'access.token' });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=refresh.token; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=604800',
    );
  });

  it('rejects a web refresh without the named cookie before calling AuthService', async () => {
    const auth = { refresh: vi.fn() };
    const controller = new AuthController(auth as never);

    await expect((controller as any).webRefresh({ headers: {} }, createResponse())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('expires a malformed refresh cookie before rejecting it', async () => {
    const auth = { refresh: vi.fn() };
    const response = createResponse();
    const controller = new AuthController(auth as never);

    await expect((controller as any).webRefresh({ headers: { cookie: 'nc_refresh=%' } }, response)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auth.refresh).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });

  it.each([
    new UnauthorizedException('invalid refresh'),
    new ForbiddenException('suspended account'),
  ])('expires the cookie when refresh is rejected with %s', async (error) => {
    const auth = { refresh: vi.fn().mockRejectedValue(error) };
    const response = createResponse();
    const controller = new AuthController(auth as never);

    await expect((controller as any).webRefresh({ headers: { cookie: 'nc_refresh=stale.refresh' } }, response)).rejects.toBe(error);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });

  it('expires the refresh cookie and sends an empty response on logout', () => {
    const response = createResponse();
    const controller = new AuthController({} as never);

    (controller as any).webLogout(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'nc_refresh=; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=0',
    );
    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.end).toHaveBeenCalledOnce();
  });
});
