import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// #28:现有 isolation.e2e 只在单一 DEMO 租户内验证 agent/merchant 隔离,
// 最根本的"租户 A 绝对看不到租户 B"从未被验证(库里只有一个租户)。
// 本套自建第二个租户 T2(独立 code/用户/数据),验证跨租户读写隔离,afterAll 清理,
// 不改全局 seed,不影响其它 e2e。
describe('跨租户隔离(多租户深度)e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let demoSysToken: string; // DEMO 租户系统管理员
  let t2SysToken: string;   // T2 租户系统管理员
  let t2MerchantToken: string;

  // T2 自建实体 id,afterAll 清理
  let t2TenantId: string;
  let t2MerchantId: string;
  let t2FieldId: string;
  let t2BatchId: string;
  const t2Code = 'ORC-T2-ISO01';

  async function login(tenantCode: string, username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login').send({ tenantCode, username, password: 'password123' }).expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const pwd = await bcrypt.hash('password123', 10);
    // 复用既有 T2(若上次未清理干净),否则新建。
    const tenant =
      (await prisma.tenant.findFirst({ where: { code: 'T2ISO' } })) ??
      (await prisma.tenant.create({ data: { name: 'T2 隔离租户', code: 'T2ISO' } }));
    t2TenantId = tenant.id;

    await prisma.user.upsert({
      where: { tenantId_username: { tenantId: t2TenantId, username: 'sysadminT2' } },
      update: {},
      create: { tenantId: t2TenantId, username: 'sysadminT2', passwordHash: pwd, role: 'system_admin', displayName: 'T2总管' },
    });
    const merchant = await prisma.user.upsert({
      where: { tenantId_username: { tenantId: t2TenantId, username: 'merchantT2' } },
      update: {},
      create: { tenantId: t2TenantId, username: 'merchantT2', passwordHash: pwd, role: 'merchant', displayName: 'T2基地' },
    });
    t2MerchantId = merchant.id;

    const field =
      (await prisma.field.findFirst({ where: { tenantId: t2TenantId, ownerId: t2MerchantId, name: 'T2地块' } })) ??
      (await prisma.field.create({ data: { tenantId: t2TenantId, ownerId: t2MerchantId, name: 'T2地块', area: 12 } }));
    t2FieldId = field.id;

    let batch = await prisma.batch.findFirst({ where: { tenantId: t2TenantId, batchNo: 'T2-ISO-001' } });
    if (!batch) {
      batch = await prisma.batch.create({ data: {
        tenantId: t2TenantId, ownerId: t2MerchantId, fieldId: t2FieldId,
        batchNo: 'T2-ISO-001', cropName: 'T2白芍',
        plantDate: new Date('2026-01-01T00:00:00Z'), expectedHarvest: new Date('2026-06-01T00:00:00Z'),
        status: 'Growing',
      }});
    }
    t2BatchId = batch.id;
    await prisma.traceCode.upsert({
      where: { code: t2Code },
      update: { tenantId: t2TenantId, batchId: t2BatchId, status: 'active' },
      create: { tenantId: t2TenantId, batchId: t2BatchId, code: t2Code },
    });

    demoSysToken = await login('DEMO', 'sysadmin');
    t2SysToken = await login('T2ISO', 'sysadminT2');
    t2MerchantToken = await login('T2ISO', 'merchantT2');
  });

  afterAll(async () => {
    // 先删子表再删父(FK Restrict)。
    await prisma.traceScan.deleteMany({ where: { tenantId: t2TenantId } });
    await prisma.traceCode.deleteMany({ where: { tenantId: t2TenantId } });
    await prisma.batch.deleteMany({ where: { tenantId: t2TenantId } });
    await prisma.field.deleteMany({ where: { tenantId: t2TenantId } });
    await prisma.creditAccount.deleteMany({ where: { tenantId: t2TenantId } });
    await prisma.user.deleteMany({ where: { tenantId: t2TenantId } });
    await prisma.tenant.deleteMany({ where: { id: t2TenantId } });
    await app.close();
  });

  it('DEMO 系统管理员的 /agents/merchants 看不到 T2 租户的商户', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/agents/merchants').set('Authorization', `Bearer ${demoSysToken}`).expect(200);
    const names = res.body.map((m: any) => m.displayName);
    expect(names).not.toContain('T2基地');
  });

  it('T2 系统管理员的 /agents/merchants 只看到本租户商户,看不到 DEMO 的', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/agents/merchants').set('Authorization', `Bearer ${t2SysToken}`).expect(200);
    const names = res.body.map((m: any) => m.displayName);
    expect(names).toContain('T2基地');
    expect(names).not.toContain('大理基地'); // DEMO 的 merchantA
    expect(names).not.toContain('上海基地'); // DEMO 的 merchantB
  });

  it('DEMO 系统管理员列地块/批次看不到 T2 租户数据', async () => {
    const fields = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${demoSysToken}`).expect(200);
    expect(fields.body.map((f: any) => f.name)).not.toContain('T2地块');
    const batches = await request(app.getHttpServer())
      .get('/api/batches').set('Authorization', `Bearer ${demoSysToken}`).expect(200);
    expect(batches.body.map((b: any) => b.batchNo)).not.toContain('T2-ISO-001');
  });

  it('T2 商户用 DEMO 租户的 batchId 生成溯源码 → 403(跨租户越权)', async () => {
    const demoBatch = await prisma.batch.findFirst({ where: { batchNo: 'PA-2026-001' } });
    expect(demoBatch).toBeTruthy();
    await request(app.getHttpServer())
      .post(`/api/trace/codes/${demoBatch!.id}?count=1`)
      .set('Authorization', `Bearer ${t2MerchantToken}`)
      .set('Idempotency-Key', `cross-tenant-e2e-${Date.now()}`)
      .expect(403);
  });

  it('T2 商户用 DEMO 租户的 batchId 列溯源事件 → 403', async () => {
    const demoBatch = await prisma.batch.findFirst({ where: { batchNo: 'PA-2026-001' } });
    await request(app.getHttpServer())
      .get(`/api/trace/events/${demoBatch!.id}`).set('Authorization', `Bearer ${t2MerchantToken}`)
      .expect(403);
  });

  it('公开溯源对任意租户的码均可读(免登录),验证 T2 的码可查', async () => {
    const res = await request(app.getHttpServer()).get(`/api/public/trace/${t2Code}`).expect(200);
    expect(res.body.code).toBe(t2Code);
  });
});
