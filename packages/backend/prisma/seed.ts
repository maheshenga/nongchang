import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.create({ data: { name: 'Demo Tenant' } });
  const pwd = await bcrypt.hash('password123', 10);

  await prisma.user.create({ data: {
    tenantId: tenant.id, role: 'system_admin',
    username: 'sysadmin', passwordHash: pwd, displayName: '李总管',
  }});

  const agentA = await prisma.agent.create({ data: { tenantId: tenant.id, name: '西南大区代理', region: '云南' } });
  const agentB = await prisma.agent.create({ data: { tenantId: tenant.id, name: '华东大区代理', region: '上海' } });

  await prisma.user.create({ data: {
    tenantId: tenant.id, role: 'agent_admin', agentId: agentA.id,
    username: 'agentA', passwordHash: pwd, displayName: 'A代理管理员',
  }});
  await prisma.user.create({ data: {
    tenantId: tenant.id, role: 'agent_admin', agentId: agentB.id,
    username: 'agentB', passwordHash: pwd, displayName: 'B代理管理员',
  }});

  const merchantA = await prisma.user.create({ data: {
    tenantId: tenant.id, role: 'merchant', agentId: agentA.id,
    username: 'merchantA', passwordHash: pwd, displayName: '大理基地',
  }});
  const merchantB = await prisma.user.create({ data: {
    tenantId: tenant.id, role: 'merchant', agentId: agentB.id,
    username: 'merchantB', passwordHash: pwd, displayName: '上海基地',
  }});

  const fieldA = await prisma.field.create({ data: {
    tenantId: tenant.id, ownerId: merchantA.id, name: 'A区露地', area: 85.7,
  }});
  await prisma.field.create({ data: {
    tenantId: tenant.id, ownerId: merchantB.id, name: 'B区大棚', area: 45.0,
  }});

  const batchA = await prisma.batch.create({ data: {
    tenantId: tenant.id, ownerId: merchantA.id, fieldId: fieldA.id,
    batchNo: 'PA-2026-001', cropName: '极品春白芍大雪素',
    plantDate: new Date('2023-10-15T00:00:00Z'),
    expectedHarvest: new Date('2026-05-10T00:00:00Z'),
    status: 'Harvested',
  }});

  const traceCode = await prisma.traceCode.create({ data: {
    tenantId: tenant.id, batchId: batchA.id, code: 'ORC-DEMO0001',
  }});

  const events = [
    { type: 'origin', title: '种苗培育', actor: '李农技 (高级农艺师)', location: '云南大理·核心育种基地', occurredAt: '2023-04-12T09:30:00Z', payload: { desc: '脱毒快繁技术室内组培。', image: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2636?q=80&w=400' } },
    { type: 'farm', title: '大田移栽', actor: '张师傅 (种植队长)', location: '云南大理·A区露地', occurredAt: '2023-10-15T14:00:00Z', payload: { desc: '秋季移栽,滴灌系统定植。', weather: '晴 24°C / 湿度 45%' } },
    { type: 'farm', title: '智能水肥记录', actor: '系统自动执行', location: '云南大理·A区露地', occurredAt: '2024-03-20T10:15:00Z', payload: { desc: 'IoT 缺水预警自动补水,追施缓释肥。', data: '土壤湿度 32%→55%' } },
    { type: 'harvest', title: '熟期采收', actor: '王大姐等12人', location: '云南大理·A区露地', occurredAt: '2026-05-10T07:00:00Z', payload: { desc: '清晨人工采摘,避免机械损伤。', image: 'https://images.unsplash.com/photo-1496843916299-590492c724f8?q=80&w=400' } },
    { type: 'warehouse', title: '冷链入库与分级', actor: '检验员007', location: '大理鲜切花产地加工中心', occurredAt: '2026-05-10T11:30:00Z', payload: { desc: 'A 级标准分级,保鲜液处理,预冷 2-4°C。', tag: 'A级精品' } },
    { type: 'logistics', title: '冷链干线运输', actor: '顺丰冷链车 (云A·88888)', location: '大理 → 昆明斗南', occurredAt: '2026-05-11T08:20:00Z', payload: { desc: '全程温湿度监控,2-6°C 冷链。', temp: '4.2°C (正常)' } },
    { type: 'retail', title: '抵达零售端', actor: '门店店长', location: '昆明市呈贡区花卉市场直营店', occurredAt: '2026-05-12T10:00:00Z', payload: { desc: '验收合格,入冰柜展示售卖。' } },
  ];
  for (const e of events) {
    await prisma.traceEvent.create({ data: {
      tenantId: tenant.id, batchId: batchA.id, type: e.type, title: e.title,
      actor: e.actor, location: e.location, occurredAt: new Date(e.occurredAt), payload: e.payload,
    }});
  }

  console.log('Seed done:', { agentA: agentA.id, agentB: agentB.id, merchantA: merchantA.id, merchantB: merchantB.id, traceCode: traceCode.code });
}

main().finally(() => prisma.$disconnect());
