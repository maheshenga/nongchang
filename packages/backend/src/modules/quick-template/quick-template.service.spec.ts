import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { QuickTemplateService } from './quick-template.service';
import type { AuthUser } from '@nongchang/shared';

const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;
const otherTenant = { userId: 'u2', tenantId: 't2', role: 'system_admin' } as AuthUser;

function makePrisma() {
  const rows: any[] = [];
  let seq = 0;
  return {
    get rows() { return rows; },
    quickTemplate: {
      create: async ({ data }: any) => { const r = { id: 'qt' + seq++, createdAt: new Date(), ...data }; rows.push(r); return r; },
      findMany: async ({ where }: any) => rows.filter(r => r.tenantId === where.tenantId),
      findFirst: async ({ where }: any) => rows.find(r => r.tenantId === where.tenantId && (where.id === undefined || r.id === where.id)) ?? null,
      update: async ({ where, data }: any) => { const r = rows.find(x => x.id === where.id); Object.assign(r, data); return r; },
      delete: async ({ where }: any) => { const i = rows.findIndex(r => r.id === where.id); rows.splice(i, 1); return {}; },
    },
  } as any;
}

describe('QuickTemplateService', () => {
  let prisma: any; let svc: QuickTemplateService;
  beforeEach(() => { prisma = makePrisma(); svc = new QuickTemplateService(prisma); });

  it('create + list 按租户隔离,默认值补全', async () => {
    await svc.create(user, { name: '浇水', action: '浇水' });
    await svc.create(otherTenant, { name: '别租户', action: '施肥' });
    const list = await svc.list(user);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('浇水');
    expect(list[0].note).toBeNull();
    expect(list[0].cost).toBeNull();
    expect(list[0].sort).toBe(0);
  });

  it('create 保留可选字段', async () => {
    const v = await svc.create(user, { name: '追肥', action: '施肥', note: '尿素', cost: 50, labor: 1, sort: 3 });
    expect(v.note).toBe('尿素');
    expect(v.cost).toBe(50);
    expect(v.labor).toBe(1);
    expect(v.sort).toBe(3);
  });

  it('update 修改字段', async () => {
    const t = await svc.create(user, { name: 'A', action: '浇水' });
    const v = await svc.update(user, t.id, { name: 'A2', action: '滴灌', note: '改' });
    expect(v.name).toBe('A2');
    expect(v.action).toBe('滴灌');
    expect(v.note).toBe('改');
  });

  it('update 跨租户/不存在抛 NotFound', async () => {
    const t = await svc.create(user, { name: 'A', action: '浇水' });
    await expect(svc.update(otherTenant, t.id, { name: 'x', action: 'y' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(user, 'nope', { name: 'x', action: 'y' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove 删除模板', async () => {
    const t = await svc.create(user, { name: 'A', action: '浇水' });
    await svc.remove(user, t.id);
    expect(await svc.list(user)).toHaveLength(0);
  });

  it('remove 跨租户抛 NotFound', async () => {
    const t = await svc.create(user, { name: 'A', action: '浇水' });
    await expect(svc.remove(otherTenant, t.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
