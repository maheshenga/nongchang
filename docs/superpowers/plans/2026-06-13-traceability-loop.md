# 溯源闭环(子项目 2)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通"消费者扫码 → 看到批次真实溯源链路"的免登录读闭环:后端一个公开只读 API + 把消费者页从 Mock 切到真实数据。

**Architecture:** 后端新增独立 `PublicTraceModule`(用子项目 1 已有的 `@Public()` 跳过全局 JWT 守卫),按 `trace_codes.code` 反查 → 顺序查批次/地块/代理商/事件 → 经白名单 DTO 脱敏返回,并原子自增 `scan_count`。前端 `TraceabilityPage.tsx` 经 Vite dev proxy 调同源 `/api` 渲染真实链路。

**Tech Stack:** NestJS 10 + Prisma 5(无表间关系,顺序 findUnique)、zod(shared DTO)、Vitest + Supertest(真实 PG e2e)、React 19 + Vite(消费者页)。

**关键约定(沿用子项目 1):**
- backend 相对 import **不带扩展名**;shared 为 CommonJS。
- 测试用 Vitest;e2e 打**真实 PostgreSQL**(docker 容器 `nongchang-postgis`,库 `nongchang`),`vitest.config.ts` 已含 `test/**/*.e2e-spec.ts`。
- git 无全局身份,提交一律用 `git -c user.name='nongchang' -c user.email='noreply@local' commit`。
- `@Public()` 装饰器在 `packages/backend/src/common/decorators/public.decorator.ts`;全局 `JwtAuthGuard` 已识别它;`RolesGuard` 在无 `@Roles` 时放行。
- 表间**无 Prisma relation**(都是裸 string id),故 service 用多次 `findUnique`/`findFirst` 顺序取数。

---

## 文件结构

**新建:**
- `packages/shared/src/dto/public-trace.dto.ts` — 公开响应的 zod schema + 类型(白名单)
- `packages/backend/src/modules/public-trace/public-trace.service.ts` — 查询 + 脱敏映射
- `packages/backend/src/modules/public-trace/public-trace.service.spec.ts` — 单元测试
- `packages/backend/src/modules/public-trace/public-trace.controller.ts` — 公开端点
- `packages/backend/src/modules/public-trace/public-trace.module.ts` — 模块声明
- `packages/backend/test/public-trace.e2e-spec.ts` — 真实 PG e2e
- `packages/web/src/api/trace.ts` — 前端公开 API 封装

**修改:**
- `packages/shared/src/index.ts` — 导出新 DTO
- `packages/backend/src/app.module.ts` — 注册 PublicTraceModule
- `packages/backend/prisma/seed.ts` — 预置批次 + 溯源码 + 7 节点链路
- `packages/web/vite.config.ts` — 加 `/api` dev proxy
- `packages/web/src/components/TraceabilityPage.tsx` — 切真实 API + 降级页

---

## Task 1: shared 公开溯源 DTO(白名单)

**Files:**
- Create: `packages/shared/src/dto/public-trace.dto.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写 DTO schema** — `packages/shared/src/dto/public-trace.dto.ts`:
```typescript
import { z } from 'zod';
import { BatchStatus, TraceEventType } from '../enums';

export const publicTraceEventSchema = z.object({
  type: z.enum([
    TraceEventType.ORIGIN, TraceEventType.FARM, TraceEventType.HARVEST,
    TraceEventType.WAREHOUSE, TraceEventType.LOGISTICS, TraceEventType.RETAIL,
  ]),
  title: z.string(),
  actor: z.string(),
  location: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.unknown()).nullable(),
});
export type PublicTraceEvent = z.infer<typeof publicTraceEventSchema>;

export const publicTraceBatchSchema = z.object({
  cropName: z.string(),
  batchNo: z.string(),
  plantDate: z.string(),
  expectedHarvest: z.string(),
  status: z.enum([
    BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED,
  ]),
  fieldName: z.string(),
  region: z.string().nullable(),
});
export type PublicTraceBatch = z.infer<typeof publicTraceBatchSchema>;

export const publicTraceResponseSchema = z.object({
  code: z.string(),
  scanCount: z.number(),
  batch: publicTraceBatchSchema,
  events: z.array(publicTraceEventSchema),
});
export type PublicTraceResponse = z.infer<typeof publicTraceResponseSchema>;
```

- [ ] **Step 2: 导出** — 在 `packages/shared/src/index.ts` 末尾追加一行:
```typescript
export * from './dto/public-trace.dto';
```

- [ ] **Step 3: 构建 shared 确认通过**

Run: `pnpm --filter @nongchang/shared build`
Expected: 编译成功,无报错。

- [ ] **Step 4: 提交**
```bash
git add packages/shared/src/dto/public-trace.dto.ts packages/shared/src/index.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(shared): add public-trace response DTO (whitelist)"
```

## Task 2: 种子数据预置批次 + 溯源码 + 7 节点链路

当前 `seed.ts` 只建了 tenant/用户/2 个 field,**没有 batch / trace_code / trace_event**。本任务补一条完整演示链路,供 e2e 与手动验证使用。

**Files:**
- Modify: `packages/backend/prisma/seed.ts`

- [ ] **Step 1: 在 field 创建后追加批次/码/事件** — 把 `seed.ts` 中两处 `prisma.field.create` 改为捕获返回值,并在其后、`console.log` 之前插入以下代码。

先将 merchantA 的 field 创建改为(替换原匿名创建):
```typescript
  const fieldA = await prisma.field.create({ data: {
    tenantId: tenant.id, ownerId: merchantA.id, name: 'A区露地', area: 85.7,
  }});
  await prisma.field.create({ data: {
    tenantId: tenant.id, ownerId: merchantB.id, name: 'B区大棚', area: 45.0,
  }});
```

然后在其后插入批次 + 溯源码 + 链路:
```typescript
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
```

并把末尾 `console.log` 改为也输出溯源码:
```typescript
  console.log('Seed done:', { agentA: agentA.id, agentB: agentB.id, merchantA: merchantA.id, merchantB: merchantB.id, traceCode: traceCode.code });
```

- [ ] **Step 2: 重置并重跑种子(真实 PG)**

Run: `docker exec nongchang-postgis psql -U nongchang -d nongchang -c "TRUNCATE trace_events, trace_codes, batches, fields, users, agents, tenants RESTART IDENTITY CASCADE;"`
然后: `pnpm --filter @nongchang/backend prisma:seed`
Expected: 输出 `Seed done:` 且含 `traceCode: 'ORC-DEMO0001'`。

- [ ] **Step 3: 校验链路已入库**

Run: `docker exec nongchang-postgis psql -U nongchang -d nongchang -tAc "SELECT count(*) FROM trace_events WHERE batch_id = (SELECT batch_id FROM trace_codes WHERE code='ORC-DEMO0001');"`
Expected: `7`

- [ ] **Step 4: 提交**
```bash
git add packages/backend/prisma/seed.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): seed demo batch, trace code and 7-node trace chain"
```

## Task 3: PublicTraceService(查询 + 脱敏,TDD)

核心逻辑:按 code 反查 → 顺序取批次/地块/owner/agent/事件(表间无 relation,用多次查询)→ 原子自增 scan_count → 经 `toPublicResponse` 白名单映射返回。

**Files:**
- Create: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Test: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`

- [ ] **Step 1: 写失败测试** — `public-trace.service.spec.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';

function makePrisma(overrides: any = {}) {
  return {
    traceCode: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tc1', tenantId: 't1', batchId: 'b1', code: 'ORC-X', scanCount: 4 }),
      update: vi.fn().mockResolvedValue({ scanCount: 5 }),
    },
    batch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1', tenantId: 't1', ownerId: 'm1', fieldId: 'f1', batchNo: 'PA-1',
        cropName: '白芍', plantDate: new Date('2023-10-15T00:00:00Z'),
        expectedHarvest: new Date('2026-05-10T00:00:00Z'), status: 'Harvested',
      }),
    },
    field: { findUnique: vi.fn().mockResolvedValue({ id: 'f1', name: 'A区露地', ownerId: 'm1' }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', agentId: 'a1' }) },
    agent: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', region: '云南' }) },
    traceEvent: {
      findMany: vi.fn().mockResolvedValue([
        { type: 'origin', title: '种苗', actor: '李', location: '大理', occurredAt: new Date('2023-04-12T09:30:00Z'), payload: { desc: 'x' } },
        { type: 'retail', title: '零售', actor: '店', location: '昆明', occurredAt: new Date('2026-05-12T10:00:00Z'), payload: null },
      ]),
    },
    ...overrides,
  } as any;
}

describe('PublicTraceService.getByCode', () => {
  it('无效 code 抛 NotFoundException', async () => {
    const prisma = makePrisma({ traceCode: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    const svc = new PublicTraceService(prisma);
    await expect(svc.getByCode('NOPE')).rejects.toThrow(NotFoundException);
    expect(prisma.traceCode.update).not.toHaveBeenCalled();
  });

  it('有效 code 返回组装后的脱敏响应', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    expect(res.code).toBe('ORC-X');
    expect(res.batch.cropName).toBe('白芍');
    expect(res.batch.fieldName).toBe('A区露地');
    expect(res.batch.region).toBe('云南');
    expect(res.batch.status).toBe('Harvested');
    expect(res.events).toHaveLength(2);
    expect(res.events[0].type).toBe('origin');
    expect(typeof res.batch.plantDate).toBe('string'); // 已转 ISO 字符串
  });

  it('scanCount 原子自增并透传新值', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    expect(prisma.traceCode.update).toHaveBeenCalledWith({
      where: { code: 'ORC-X' }, data: { scanCount: { increment: 1 } },
    });
    expect(res.scanCount).toBe(5);
  });

  it('事件按 occurredAt 升序查询', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    await svc.getByCode('ORC-X');
    expect(prisma.traceEvent.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', batchId: 'b1' }, orderBy: { occurredAt: 'asc' },
    });
  });

  it('响应不含任何内部字段(脱敏)', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    const json = JSON.stringify(res);
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('ownerId');
    expect(json).not.toContain('t1');   // tenantId 值
    expect(json).not.toContain('m1');   // ownerId 值
    expect(json).not.toContain('fieldId');
    expect(json).not.toContain('batchId');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.service.spec.ts`
Expected: FAIL — PublicTraceService 未定义。

- [ ] **Step 3: 实现 service** — `public-trace.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicTraceResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicTraceService {
  constructor(private prisma: PrismaService) {}

  async getByCode(code: string): Promise<PublicTraceResponse> {
    const traceCode = await this.prisma.traceCode.findUnique({ where: { code } });
    if (!traceCode) throw new NotFoundException('溯源码不存在');

    const batch = await this.prisma.batch.findUnique({ where: { id: traceCode.batchId } });
    if (!batch) throw new NotFoundException('批次不存在');

    const field = await this.prisma.field.findUnique({ where: { id: batch.fieldId } });
    const owner = await this.prisma.user.findUnique({ where: { id: batch.ownerId } });
    const agent = owner?.agentId
      ? await this.prisma.agent.findUnique({ where: { id: owner.agentId } })
      : null;

    const events = await this.prisma.traceEvent.findMany({
      where: { tenantId: traceCode.tenantId, batchId: batch.id },
      orderBy: { occurredAt: 'asc' },
    });

    const updated = await this.prisma.traceCode.update({
      where: { code },
      data: { scanCount: { increment: 1 } },
    });

    return {
      code: traceCode.code,
      scanCount: updated.scanCount,
      batch: {
        cropName: batch.cropName,
        batchNo: batch.batchNo,
        plantDate: batch.plantDate.toISOString(),
        expectedHarvest: batch.expectedHarvest.toISOString(),
        status: batch.status as PublicTraceResponse['batch']['status'],
        fieldName: field?.name ?? '',
        region: agent?.region ?? null,
      },
      events: events.map((e) => ({
        type: e.type as PublicTraceResponse['events'][number]['type'],
        title: e.title,
        actor: e.actor,
        location: e.location,
        occurredAt: e.occurredAt.toISOString(),
        payload: (e.payload as Record<string, unknown> | null) ?? null,
      })),
    };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.service.spec.ts`
Expected: PASS(5 用例)。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/src/modules/public-trace/public-trace.service.ts packages/backend/src/modules/public-trace/public-trace.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add PublicTraceService with desensitized lookup (tested)"
```

## Task 4: PublicTraceController + Module + 注册到 AppModule

**Files:**
- Create: `packages/backend/src/modules/public-trace/public-trace.controller.ts`
- Create: `packages/backend/src/modules/public-trace/public-trace.module.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: Controller** — `public-trace.controller.ts`:
```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTraceService } from './public-trace.service';

@Controller('public/trace')
export class PublicTraceController {
  constructor(private svc: PublicTraceService) {}

  @Public()
  @Get(':code')
  get(@Param('code') code: string) {
    return this.svc.getByCode(code);
  }
}
```

- [ ] **Step 2: Module** — `public-trace.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';
import { PublicTraceController } from './public-trace.controller';

@Module({ providers: [PublicTraceService], controllers: [PublicTraceController] })
export class PublicTraceModule {}
```

- [ ] **Step 3: 注册到 AppModule** — 编辑 `packages/backend/src/app.module.ts`:加入 import 并加进 `imports` 数组(放在 UserModule 之后):
```typescript
import { PublicTraceModule } from './modules/public-trace/public-trace.module';
```
imports 数组追加 `PublicTraceModule,`。

- [ ] **Step 4: 构建确认通过**

Run: `pnpm --filter @nongchang/backend build`
Expected: 编译成功(AppModule 所有 import 解析)。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/src/modules/public-trace/public-trace.controller.ts packages/backend/src/modules/public-trace/public-trace.module.ts packages/backend/src/app.module.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add public trace controller and module (public GET /api/public/trace/:code)"
```

## Task 5: 公开溯源 e2e(真实 PG,关键验收)

延续子项目 1 `test/isolation.e2e-spec.ts` 风格,打真实 Nest 应用 + 真实 PG。依赖 Task 2 的种子(`ORC-DEMO0001` + 7 节点)。

**Files:**
- Create: `packages/backend/test/public-trace.e2e-spec.ts`

- [ ] **Step 1: 确认种子已就位**

Run: `docker exec nongchang-postgis psql -U nongchang -d nongchang -tAc "SELECT code FROM trace_codes WHERE code='ORC-DEMO0001';"`
Expected: `ORC-DEMO0001`(若为空,先跑 Task 2 Step 2 的 seed)。

- [ ] **Step 2: 写 e2e** — `packages/backend/test/public-trace.e2e-spec.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: INestApplication;

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('公开溯源接口(免登录)', () => {
  it('免登录可读真实链路,节点数与顺序正确', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/trace/ORC-DEMO0001').expect(200);
    expect(res.body.code).toBe('ORC-DEMO0001');
    expect(res.body.batch.cropName).toBe('极品春白芍大雪素');
    expect(res.body.batch.region).toBe('云南');
    expect(res.body.events.length).toBe(7);
    expect(res.body.events[0].type).toBe('origin');
    expect(res.body.events[6].type).toBe('retail');
    const times = res.body.events.map((e: any) => e.occurredAt);
    expect(times).toEqual([...times].sort());
  });

  it('不存在的 code 返回 404', async () => {
    await request(app.getHttpServer())
      .get('/api/public/trace/ORC-NOPE9999').expect(404);
  });

  it('连续两次请求 scanCount 递增', async () => {
    const r1 = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    const r2 = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    expect(r2.body.scanCount).toBe(r1.body.scanCount + 1);
  });

  it('响应体不泄露任何敏感字段', async () => {
    const res = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('ownerId');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('batchId');
  });
});
```

- [ ] **Step 3: 跑 e2e**

Run: `pnpm --filter @nongchang/backend exec vitest run test/public-trace.e2e-spec.ts`
Expected: PASS(4 用例)。

- [ ] **Step 4: 全量测试**

Run: `pnpm --filter @nongchang/backend test`
Expected: 子项目 1 全部 + 本轮新增,全绿。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/test/public-trace.e2e-spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "test(backend): add public trace e2e (real PG, desensitization + scan_count)"
```

## Task 6: Vite dev proxy + 前端 API 封装

让前端开发态调后端无需 CORS:`/api` 经 Vite proxy 转发到 `localhost:3001`,与生产 Nginx 同源行为一致。再建 web 包第一个真实 API 封装。

**Files:**
- Modify: `packages/web/vite.config.ts`
- Create: `packages/web/src/api/trace.ts`

- [ ] **Step 1: 加 dev proxy** — 编辑 `packages/web/vite.config.ts`,在 `server` 配置里加 `proxy`(保留现有 hmr/watch 设置):
```typescript
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
```

- [ ] **Step 2: 前端 API 封装** — `packages/web/src/api/trace.ts`:
```typescript
import type { PublicTraceResponse } from '@nongchang/shared';

export class TraceNotFoundError extends Error {}

export async function fetchPublicTrace(code: string): Promise<PublicTraceResponse> {
  const res = await fetch(`/api/public/trace/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new TraceNotFoundError('溯源码无效或不存在');
  if (!res.ok) throw new Error(`溯源查询失败 (${res.status})`);
  return res.json() as Promise<PublicTraceResponse>;
}
```

- [ ] **Step 3: 构建 web 确认通过**

Run: `pnpm --filter web build`
Expected: Vite 构建成功,产出 `packages/web/dist`。

- [ ] **Step 4: 提交**
```bash
git add packages/web/vite.config.ts packages/web/src/api/trace.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add /api dev proxy and public trace fetch helper"
```

## Task 7: TraceabilityPage 切真实 API + 降级页

把 `TraceabilityPage.tsx` 从写死 `MOCK_JOURNEY` 改为调 `fetchPublicTrace(code)`,按 `type` 映射图标,从 `payload` 读富信息,加 404/错误降级页。保留绿色卡片时间线视觉。不引入前端测试框架(留子项目 4),正确性靠后端 e2e + 手动验证。

**Files:**
- Modify: `packages/web/src/components/TraceabilityPage.tsx`

- [ ] **Step 1: 替换数据来源与状态** — 重写组件顶部(import、状态、数据获取)。把文件开头到 `export default function ...` 内 `useEffect` 段替换为:
```typescript
import { useState, useEffect } from 'react';
import { ShieldCheck, MapPin, Calendar, Sprout, Truck, Store, Leaf, ArrowLeft, Hexagon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { fetchPublicTrace, TraceNotFoundError } from '../api/trace';
import type { PublicTraceResponse, TraceEventType } from '@nongchang/shared';

const ICON_BY_TYPE: Record<TraceEventType, typeof Sprout> = {
  origin: Sprout, farm: Leaf, harvest: Sun, warehouse: Hexagon, logistics: Truck, retail: Store,
};

export default function TraceabilityPage({ code, onBack }: { code: string, onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState<'journey' | 'cert'>('journey');
  const [data, setData] = useState<PublicTraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetchPublicTrace(code)
      .then((res) => { if (alive) setData(res); })
      .catch((e) => { if (alive) setError(e instanceof TraceNotFoundError ? e.message : '溯源查询失败,请稍后重试'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code]);
```

- [ ] **Step 2: 加载/降级渲染** — 在 `return (` 主体之前插入 loading 与 error 的早返回:
```typescript
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600">
        <ShieldCheck className="w-10 h-10 text-emerald-500 animate-pulse mb-3" />
        <p className="text-sm tracking-widest">正在验证溯源档案…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 px-6 text-center">
        <ShieldCheck className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-lg font-bold text-slate-800 mb-1">溯源码无效或不存在</h2>
        <p className="text-sm text-slate-500 mb-6 break-all">{error ?? `未找到溯源码 ${code}`}</p>
        {onBack && (
          <button onClick={onBack} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-sm font-medium transition-colors">返回</button>
        )}
      </div>
    );
  }
```

- [ ] **Step 3: 用真实数据渲染头部与时间线** — 将原 header 中写死的标题/产地与 `MOCK_JOURNEY.map(...)` 时间线改为使用 `data`。头部回显字段:
```typescript
  // 头部:作物名 data.batch.cropName;产地 data.batch.region ?? data.batch.fieldName;批次 data.batch.batchNo;溯源码 data.code
  // 时间线:data.events.map((ev) => { const Icon = ICON_BY_TYPE[ev.type]; ... })
  //   富信息从 ev.payload 读取(可能为 null),按 key 取:
  //   const p = (ev.payload ?? {}) as Record<string, unknown>;
  //   desc = p.desc as string | undefined; image = p.image as string | undefined;
  //   weather = p.weather; temp = p.temp; tag = p.tag; data2 = p.data;
  //   仅当对应 key 存在时渲染该信息块(优雅降级)。
```
具体替换:把原组件中 `MOCK_JOURNEY` 常量整体删除;把渲染时间线的 `.map` 数据源由 `MOCK_JOURNEY` 改为 `data.events`,节点字段改为 `ev.title / ev.occurredAt / ev.location / ev.actor`,图标用 `ICON_BY_TYPE[ev.type]`,富信息块从 `p` 读取并加存在性判断;把头部写死的 `{code}` 保留(已是 prop),作物名/产地/批次号改用 `data.batch.*`。

- [ ] **Step 4: 调整 tab** — 把 `activeTab` 类型从 `'journey' | 'cert' | 'data'` 改为 `'journey' | 'cert'`(已在 Step 1 完成);删除"数据图表"tab 按钮及其 `activeTab === 'data'` 的渲染分支。"防伪验证"(cert)分支改为展示 `data.code`、`data.scanCount`(累计扫码次数)与有效性提示。

- [ ] **Step 5: 构建确认通过**

Run: `pnpm --filter web build`
Expected: 构建成功,无 TS 报错(注意 lucide 图标 import 已按 Step 1 精简,删除未用图标如 Droplet/CheckCircle/Map/Leaf 中实际未用到的;以 tsc 报错为准清理)。

- [ ] **Step 6: 手动验证(记录步骤,不强制 CI)**

1. 终端 A:`pnpm --filter @nongchang/backend start`(需 `.env` 含 DATABASE_URL,且 Task 2 种子已跑)。
2. 终端 B:`pnpm --filter web dev`,浏览器开 `http://localhost:5173/#/trace/ORC-DEMO0001`(或 App 里触发 traceCode 的入口)。
3. 预期:看到"极品春白芍大雪素"头部 + 7 节点真实时间线;改用不存在的 code 看到降级页;刷新页面 scanCount 递增。

- [ ] **Step 7: 提交**
```bash
git add packages/web/src/components/TraceabilityPage.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): wire consumer trace page to real public API with fallback"
```

---

## 完成验收标准

- `pnpm --filter @nongchang/backend test` 全绿(子项目 1 + 本轮新增单元 5 + e2e 4)。
- 免登录 `GET /api/public/trace/ORC-DEMO0001` 返回 7 节点真实链路;无效 code → 404 / 降级页;scanCount 随扫码递增。
- 公开响应零敏感字段(单元 + e2e 双重断言)。
- `pnpm build:shared && pnpm build:backend && pnpm --filter web build` 全部成功。
- 消费者页手动验证可见真实链路与降级页。

后续子项目(3 农户小程序 / 4 Web 真实化 / 5 实时与 AI)在此基础上扩展。
