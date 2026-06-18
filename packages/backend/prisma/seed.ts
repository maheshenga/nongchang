import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 幂等种子:可在已填充的数据库上反复执行,始终把演示数据恢复到规范状态。
// 以稳定唯一键(username / traceCode.code / batchNo)定位既有实体并复用,
// 缺失则补建;额度账户按规范值恢复,演示链路按 7 节点重建。
async function main() {
  const pwd = await bcrypt.hash('password123', 10);

  // 租户:按名复用,避免每次执行新建。code='DEMO' 作为登录机构编码锚点。
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: 'Demo Tenant' } })) ??
    (await prisma.tenant.create({ data: { name: 'Demo Tenant', code: 'DEMO' } }));
  if (tenant.code !== 'DEMO') {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { code: 'DEMO' } });
  }

  // 代理商:无唯一约束,按 租户+名 复用。
  async function ensureAgent(name: string, region: string) {
    return (
      (await prisma.agent.findFirst({ where: { tenantId: tenant.id, name } })) ??
      (await prisma.agent.create({ data: { tenantId: tenant.id, name, region } }))
    );
  }
  const agentA = await ensureAgent('西南大区代理', '云南');
  const agentB = await ensureAgent('华东大区代理', '上海');

  // 用户:username 现为租户内唯一,upsert 用 (tenantId, username) 复合键幂等。
  async function ensureUser(username: string, data: { role: Role; displayName: string; agentId?: string }) {
    return prisma.user.upsert({
      where: { tenantId_username: { tenantId: tenant.id, username } },
      update: { role: data.role, displayName: data.displayName, agentId: data.agentId ?? null },
      create: { tenantId: tenant.id, username, passwordHash: pwd, role: data.role, displayName: data.displayName, agentId: data.agentId ?? null },
    });
  }
  await ensureUser('sysadmin', { role: 'system_admin', displayName: '李总管' });
  await ensureUser('agentA', { role: 'agent_admin', displayName: 'A代理管理员', agentId: agentA.id });
  await ensureUser('agentB', { role: 'agent_admin', displayName: 'B代理管理员', agentId: agentB.id });
  const merchantA = await ensureUser('merchantA', { role: 'merchant', displayName: '大理基地', agentId: agentA.id });
  const merchantB = await ensureUser('merchantB', { role: 'merchant', displayName: '上海基地', agentId: agentB.id });

  // 地块:无唯一约束,按 租户+归属+名 复用。
  async function ensureField(ownerId: string, name: string, area: number) {
    return (
      (await prisma.field.findFirst({ where: { tenantId: tenant.id, ownerId, name } })) ??
      (await prisma.field.create({ data: { tenantId: tenant.id, ownerId, name, area } }))
    );
  }
  const fieldA = await ensureField(merchantA.id, 'A区露地', 85.7);
  await ensureField(merchantB.id, 'B区大棚', 45.0);

  // 演示批次:按 batchNo 复用(归属/地块若漂移则纠正)。
  let batchA = await prisma.batch.findFirst({ where: { tenantId: tenant.id, batchNo: 'PA-2026-001' } });
  if (!batchA) {
    batchA = await prisma.batch.create({ data: {
      tenantId: tenant.id, ownerId: merchantA.id, fieldId: fieldA.id,
      batchNo: 'PA-2026-001', cropName: '极品春白芍大雪素',
      plantDate: new Date('2023-10-15T00:00:00Z'),
      expectedHarvest: new Date('2026-05-10T00:00:00Z'),
      status: 'Harvested',
    }});
  } else {
    batchA = await prisma.batch.update({
      where: { id: batchA.id },
      data: { ownerId: merchantA.id, fieldId: fieldA.id, cropName: '极品春白芍大雪素', status: 'Harvested' },
    });
  }

  // 演示溯源码:code 唯一,upsert 并归位到演示批次。
  const traceCode = await prisma.traceCode.upsert({
    where: { code: 'ORC-DEMO0001' },
    update: { tenantId: tenant.id, batchId: batchA.id, status: 'active' },
    create: { tenantId: tenant.id, batchId: batchA.id, code: 'ORC-DEMO0001' },
  });

  // 7 节点链路:重建以保证数量与顺序确定。
  const events = [
    { type: 'origin', title: '种苗培育', actor: '李农技 (高级农艺师)', location: '云南大理·核心育种基地', occurredAt: '2023-04-12T09:30:00Z', payload: { desc: '脱毒快繁技术室内组培。', image: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2636?q=80&w=400' } },
    { type: 'farm', title: '大田移栽', actor: '张师傅 (种植队长)', location: '云南大理·A区露地', occurredAt: '2023-10-15T14:00:00Z', payload: { desc: '秋季移栽,滴灌系统定植。', weather: '晴 24°C / 湿度 45%' } },
    { type: 'farm', title: '智能水肥记录', actor: '系统自动执行', location: '云南大理·A区露地', occurredAt: '2024-03-20T10:15:00Z', payload: { desc: 'IoT 缺水预警自动补水,追施缓释肥。', data: '土壤湿度 32%→55%' } },
    { type: 'harvest', title: '熟期采收', actor: '王大姐等12人', location: '云南大理·A区露地', occurredAt: '2026-05-10T07:00:00Z', payload: { desc: '清晨人工采摘,避免机械损伤。', image: 'https://images.unsplash.com/photo-1496843916299-590492c724f8?q=80&w=400' } },
    { type: 'warehouse', title: '冷链入库与分级', actor: '检验员007', location: '大理鲜切花产地加工中心', occurredAt: '2026-05-10T11:30:00Z', payload: { desc: 'A 级标准分级,保鲜液处理,预冷 2-4°C。', tag: 'A级精品' } },
    { type: 'logistics', title: '冷链干线运输', actor: '顺丰冷链车 (云A·88888)', location: '大理 → 昆明斗南', occurredAt: '2026-05-11T08:20:00Z', payload: { desc: '全程温湿度监控,2-6°C 冷链。', temp: '4.2°C (正常)' } },
    { type: 'retail', title: '抵达零售端', actor: '门店店长', location: '昆明市呈贡区花卉市场直营店', occurredAt: '2026-05-12T10:00:00Z', payload: { desc: '验收合格,入冰柜展示售卖。' } },
  ];
  await prisma.traceEvent.deleteMany({ where: { batchId: batchA.id } });
  for (const e of events) {
    await prisma.traceEvent.create({ data: {
      tenantId: tenant.id, batchId: batchA.id, type: e.type, title: e.title,
      actor: e.actor, location: e.location, occurredAt: new Date(e.occurredAt), payload: e.payload,
    }});
  }

  // ── 计费额度预置(演示用)── update 分支恢复规范余额,保证再次执行后额度回满。
  await prisma.creditAccount.upsert({
    where: { tenantId_ownerType_ownerId: { tenantId: tenant.id, ownerType: 'PLATFORM', ownerId: 'PLATFORM' } },
    update: { tenantId: tenant.id, aiBalance: 100000, codeBalance: 1000000 },
    create: { ownerType: 'PLATFORM', ownerId: 'PLATFORM', tenantId: tenant.id, aiBalance: 100000, codeBalance: 1000000 },
  });
  for (const ag of [agentA, agentB]) {
    await prisma.creditAccount.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId: tenant.id, ownerType: 'AGENT', ownerId: ag.id } },
      update: { tenantId: tenant.id, aiBalance: 5000, codeBalance: 50000 },
      create: { ownerType: 'AGENT', ownerId: ag.id, tenantId: tenant.id, aiBalance: 5000, codeBalance: 50000 },
    });
  }
  for (const m of [merchantA, merchantB]) {
    await prisma.creditAccount.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId: tenant.id, ownerType: 'MERCHANT', ownerId: m.id } },
      update: { tenantId: tenant.id, aiBalance: 1000, codeBalance: 10000 },
      create: { ownerType: 'MERCHANT', ownerId: m.id, tenantId: tenant.id, aiBalance: 1000, codeBalance: 10000 },
    });
  }

  // ── 售卖套餐预置(演示用):固定套餐 + 单价基准(isUnit)──
  // CreditPlan 无自然唯一键,按 (tenantId,name) 复用以保证幂等。
  const planSeeds = [
    { name: 'AI 算力 100 次', resource: 'AI' as const, quantity: 100, priceCents: 1000, isUnit: false },
    { name: 'AI 算力 500 次', resource: 'AI' as const, quantity: 500, priceCents: 4500, isUnit: false },
    { name: 'AI 算力单价', resource: 'AI' as const, quantity: 1, priceCents: 12, isUnit: true },
    { name: '二维码 1000 个', resource: 'CODE' as const, quantity: 1000, priceCents: 2000, isUnit: false },
    { name: '二维码 5000 个', resource: 'CODE' as const, quantity: 5000, priceCents: 9000, isUnit: false },
    { name: '二维码单价', resource: 'CODE' as const, quantity: 1, priceCents: 3, isUnit: true },
  ];
  for (const p of planSeeds) {
    const existing = await prisma.creditPlan.findFirst({ where: { tenantId: tenant.id, name: p.name } });
    if (existing) {
      await prisma.creditPlan.update({ where: { id: existing.id }, data: { ...p, active: true } });
    } else {
      await prisma.creditPlan.create({ data: { tenantId: tenant.id, active: true, ...p } });
    }
  }

  console.log('Seed done:', { agentA: agentA.id, agentB: agentB.id, merchantA: merchantA.id, merchantB: merchantB.id, traceCode: traceCode.code });
}

main().finally(() => prisma.$disconnect());
