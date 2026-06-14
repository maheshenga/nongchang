import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UserGroupService } from './user-group.service';
import type { AuthUser } from '@nongchang/shared';

const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;
const otherTenant = { userId: 'u2', tenantId: 't2', role: 'system_admin' } as AuthUser;

function makePrisma() {
  const groups: any[] = [];
  const users: any[] = [{ id: 'mem1', tenantId: 't1', groupId: null }];
  let seq = 0;
  return {
    get groups() { return groups; },
    get users() { return users; },
    userGroup: {
      create: async ({ data }: any) => { const g = { id: 'g' + seq++, createdAt: new Date(), permissions: [], ...data }; groups.push(g); return g; },
      findMany: async ({ where }: any) => groups.filter(g => g.tenantId === where.tenantId),
      findFirst: async ({ where }: any) => groups.find(g => g.tenantId === where.tenantId && (where.isDefault === undefined || g.isDefault === where.isDefault) && (where.id === undefined || g.id === where.id)) ?? null,
      update: async ({ where, data }: any) => { const g = groups.find(x => x.id === where.id); Object.assign(g, data); return g; },
      updateMany: async ({ where, data }: any) => { groups.filter(g => g.tenantId === where.tenantId).forEach(g => Object.assign(g, data)); return { count: 0 }; },
      delete: async ({ where }: any) => { const i = groups.findIndex(g => g.id === where.id); groups.splice(i, 1); return {}; },
    },
    user: {
      findFirst: async ({ where }: any) => users.find(u => u.id === where.id && u.tenantId === where.tenantId) ?? null,
      update: async ({ where, data }: any) => { const u = users.find(x => x.id === where.id); Object.assign(u, data); return u; },
    },
  } as any;
}

describe('UserGroupService', () => {
  let prisma: any; let svc: UserGroupService;
  beforeEach(() => { prisma = makePrisma(); svc = new UserGroupService(prisma); });

  it('create + list 按租户隔离', async () => {
    await svc.create(user, { name: '默认农户', permissions: ['record:create'] });
    await svc.create(otherTenant, { name: '别租户组' });
    const list = await svc.list(user);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('默认农户');
    expect(list[0].permissions).toEqual(['record:create']);
  });

  it('设为默认时其它组取消默认', async () => {
    const a = await svc.create(user, { name: 'A', isDefault: true });
    const b = await svc.create(user, { name: 'B', isDefault: true });
    const groupA = prisma.groups.find((g: any) => g.id === a.id);
    const groupB = prisma.groups.find((g: any) => g.id === b.id);
    expect(groupA.isDefault).toBe(false);
    expect(groupB.isDefault).toBe(true);
  });

  it('update 修改权限', async () => {
    const g = await svc.create(user, { name: 'A', permissions: [] });
    const v = await svc.update(user, g.id, { name: 'A2', permissions: ['trace:view'] });
    expect(v.name).toBe('A2');
    expect(v.permissions).toEqual(['trace:view']);
  });

  it('update 不存在抛 NotFound', async () => {
    await expect(svc.update(user, 'nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ensureDefault 无默认组时创建一个', async () => {
    const g = await svc.ensureDefault('t1');
    expect(g.isDefault).toBe(true);
    expect(prisma.groups).toHaveLength(1);
    // 再次调用复用现有
    const g2 = await svc.ensureDefault('t1');
    expect(g2.id).toBe(g.id);
    expect(prisma.groups).toHaveLength(1);
  });

  it('assignUserGroup 改用户所属组(租户内)', async () => {
    const g = await svc.create(user, { name: 'A' });
    await svc.assignUserGroup(user, { userId: 'mem1', groupId: g.id });
    expect(prisma.users[0].groupId).toBe(g.id);
  });

  it('assignUserGroup 跨租户用户抛 NotFound', async () => {
    const g = await svc.create(user, { name: 'A' });
    await expect(svc.assignUserGroup(otherTenant, { userId: 'mem1', groupId: g.id })).rejects.toBeInstanceOf(NotFoundException);
  });
});
