import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { JwtStrategy } from './jwt.strategy';

const activeTenant = { status: 'active' };

function makeStrategy(user: any, agent: any = null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
    agent: {
      findFirst: vi.fn().mockResolvedValue(agent),
    },
  } as any;
  return { strategy: new JwtStrategy(prisma), prisma };
}

describe('JwtStrategy session revocation', () => {
  it('returns current DB-backed user when token version matches', async () => {
    const { strategy, prisma } = makeStrategy({
      id: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      sessionVersion: 2,
      tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      ownerId: 'u1',
      sessionVersion: 2,
      sub: 'u1',
    })).resolves.toEqual({
      userId: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      ownerId: 'u1',
      sessionVersion: 2,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      include: { tenant: { select: { status: true } } },
    });
  });

  it('treats missing legacy token version as 0', async () => {
    const { strategy } = makeStrategy({
      id: 'u1',
      tenantId: 't1',
      role: Role.MEMBER,
      agentId: null,
      status: 'active',
      sessionVersion: 0,
      tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1',
      tenantId: 't1',
      role: Role.MEMBER,
      agentId: null,
      ownerId: null,
      sub: 'u1',
    })).resolves.toMatchObject({ userId: 'u1', sessionVersion: 0 });
  });

  it('rejects stale access tokens', async () => {
    const { strategy } = makeStrategy({
      id: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      sessionVersion: 3,
      tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      ownerId: 'u1',
      sessionVersion: 2,
      sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens for deleted users', async () => {
    const { strategy } = makeStrategy(null);

    await expect(strategy.validate({
      userId: 'missing-user',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      ownerId: 'missing-user',
      sessionVersion: 0,
      sub: 'missing-user',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects disabled users', async () => {
    const { strategy } = makeStrategy({
      id: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'suspended',
      sessionVersion: 0,
      tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      ownerId: 'u1',
      sessionVersion: 0,
      sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects disabled tenants', async () => {
    const { strategy } = makeStrategy({
      id: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      sessionVersion: 0,
      tenant: { status: 'suspended' },
    });

    await expect(strategy.validate({
      userId: 'u1',
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: null,
      ownerId: 'u1',
      sessionVersion: 0,
      sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects agent_admin tokens when the linked agent is suspended', async () => {
    const { strategy, prisma } = makeStrategy({
      id: 'u1',
      tenantId: 't1',
      role: Role.AGENT_ADMIN,
      agentId: 'a1',
      status: 'active',
      sessionVersion: 0,
      tenant: activeTenant,
    }, { id: 'a1', status: 'suspended' });

    await expect(strategy.validate({
      userId: 'u1',
      tenantId: 't1',
      role: Role.AGENT_ADMIN,
      agentId: 'a1',
      ownerId: null,
      sessionVersion: 0,
      sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 't1' },
      select: { id: true, status: true },
    });
  });
});
