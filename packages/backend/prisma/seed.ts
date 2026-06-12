import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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

  await prisma.field.create({ data: {
    tenantId: tenant.id, ownerId: merchantA.id, name: 'A区露地', area: 85.7,
  }});
  await prisma.field.create({ data: {
    tenantId: tenant.id, ownerId: merchantB.id, name: 'B区大棚', area: 45.0,
  }});

  console.log('Seed done:', { agentA: agentA.id, agentB: agentB.id, merchantA: merchantA.id, merchantB: merchantB.id });
}

main().finally(() => prisma.$disconnect());
