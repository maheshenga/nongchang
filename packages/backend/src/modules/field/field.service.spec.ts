import { describe, it, expect, vi } from 'vitest';
import { FieldService } from './field.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser, type CreateFieldDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const sysadmin: AuthUser = { userId: 's', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const dto: CreateFieldDto = { ownerId: 'someoneElse', name: 'A区', area: 10, lng: 100, lat: 25 };

function make(ownerFound = true) {
  let created: any;
  const prisma = {
    field: { create: async (a: any) => { created = a; return { id: 'f1', ...a.data }; } },
    user: { findFirst: vi.fn().mockResolvedValue(ownerFound ? { id: 'mX' } : null), findMany: vi.fn().mockResolvedValue([]) },
    $executeRawUnsafe: async () => 1,
  };
  return { svc: new FieldService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('FieldService.create #23', () => {
  it('merchant:强制 ownerId=self', async () => {
    const h = make();
    await h.svc.create(merchant, dto);
    expect(h.created.data.ownerId).toBe('m1');
  });
  it('sysadmin:目标 owner 命中则采纳 dto.ownerId', async () => {
    const h = make(true);
    await h.svc.create(sysadmin, dto);
    expect(h.created.data.ownerId).toBe('someoneElse');
  });
  it('sysadmin:目标 owner 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.create(sysadmin, dto)).rejects.toThrow();
    expect(h.created).toBeUndefined();
  });
});
