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
      create: async ({ data }: any) => {
        const row = { id: 'qt' + seq++, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: any) => rows.filter(row => row.tenantId === where.tenantId),
      findFirst: async ({ where }: any) => rows.find(row => (
        row.tenantId === where.tenantId && (where.id === undefined || row.id === where.id)
      )) ?? null,
      update: async ({ where, data }: any) => {
        const row = rows.find(item => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const index = rows.findIndex(row => row.id === where.id);
        rows.splice(index, 1);
        return {};
      },
    },
  } as any;
}

describe('QuickTemplateService', () => {
  let prisma: any;
  let svc: QuickTemplateService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new QuickTemplateService(prisma);
  });

  it('create + list 按租户隔离并补默认值', async () => {
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
    const view = await svc.create(user, {
      name: '追肥',
      action: '施肥',
      note: '尿素',
      cost: 50,
      labor: 1,
      sort: 3,
    });

    expect(view.note).toBe('尿素');
    expect(view.cost).toBe(50);
    expect(view.labor).toBe(1);
    expect(view.sort).toBe(3);
  });

  it('update 修改字段', async () => {
    const template = await svc.create(user, { name: 'A', action: '浇水' });

    const view = await svc.update(user, template.id, { name: 'A2', action: '滴灌', note: '改' });

    expect(view.name).toBe('A2');
    expect(view.action).toBe('滴灌');
    expect(view.note).toBe('改');
  });

  it('update 跨租户或不存在时抛 NotFound', async () => {
    const template = await svc.create(user, { name: 'A', action: '浇水' });

    await expect(svc.update(otherTenant, template.id, { name: 'x', action: 'y' }))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(user, 'nope', { name: 'x', action: 'y' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove 删除模板', async () => {
    const template = await svc.create(user, { name: 'A', action: '浇水' });

    await svc.remove(user, template.id);

    expect(await svc.list(user)).toHaveLength(0);
  });

  it('remove 跨租户时抛 NotFound', async () => {
    const template = await svc.create(user, { name: 'A', action: '浇水' });

    await expect(svc.remove(otherTenant, template.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
