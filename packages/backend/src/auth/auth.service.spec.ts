import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

const makeService = (user: any) => {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
  const jwt = new JwtService({ secret: 'test' });
  return new AuthService(prisma, jwt);
};

beforeEach(() => { process.env.JWT_SECRET = 'test'; process.env.JWT_REFRESH_SECRET = 'test'; });

describe('AuthService.login', () => {
  it('密码正确时返回 token 对', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: 'a1', passwordHash: hash });
    const res = await svc.login({ username: 'merchantA', password: 'password123' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('密码错误时抛 Unauthorized', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, passwordHash: hash });
    await expect(svc.login({ username: 'x', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户不存在时抛 Unauthorized', async () => {
    const svc = makeService(null);
    await expect(svc.login({ username: 'none', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.refresh', () => {
  it('有效 refresh token 重新签发 token 对', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const prisma = { user: { findUnique: vi.fn() } } as any;
    const svc = new AuthService(prisma, jwt);
    const rt = await jwt.signAsync(
      { userId: 'u1', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'u1' },
      { secret: 'test', expiresIn: '7d' },
    );
    const res = await svc.refresh(rt);
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('无效 refresh token 抛 Unauthorized', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const svc = new AuthService({ user: { findUnique: vi.fn() } } as any, jwt);
    await expect(svc.refresh('garbage.token.value')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
