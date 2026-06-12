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
