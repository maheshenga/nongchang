# 防伪监控真实化(子项目5-1)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 把 web 后台防伪监控屏从 mock 模拟流改造为「扫码落明细 → 异常聚合检测 → 管理员手动冻结 → 公开端点拦截被冻结码」的真实闭环。

**Architecture:** 公开溯源端点扫码时 best-effort 落一条 `TraceScan` 明细;新增受保护 `AntiFakeModule` 提供扫码列表/聚合告警/冻结-解冻端点(经 `ScopeService` 多租户作用域,fail-closed);告警为实时聚合查询不落表;冻结改 `TraceCode.status`,公开端点据此拦截。前端 `AntiFakeMonitor` 改 REST 轮询。

**Tech Stack:** NestJS 10 + Prisma(PostgreSQL/PostGIS) + Vitest/supertest;React 19 + Vite + Vitest + Testing Library;zod 共享 DTO(@nongchang/shared)。

---

## 文件结构

**后端(packages/backend):**
- 改 `prisma/schema.prisma` — `TraceCode` 加 `status`;新增 `TraceScan` model
- 新增 `prisma/migrations/<ts>_anti_fake/migration.sql` — 建表+加列+索引
- 改 `src/modules/public-trace/public-trace.service.ts` — frozen 拦截 + best-effort 落明细
- 新增 `src/modules/anti-fake/anti-fake.service.ts` — listScans/listAlerts/freeze/unfreeze
- 新增 `src/modules/anti-fake/anti-fake.controller.ts` — 4 个受保护端点
- 新增 `src/modules/anti-fake/anti-fake.module.ts`
- 改 `src/app.module.ts` — 注册 AntiFakeModule
- 新增 `src/modules/anti-fake/anti-fake.service.spec.ts` — 单元(mock Prisma)
- 新增 `src/modules/public-trace/public-trace.service.spec.ts` 增补 frozen/落明细用例(若已存在则追加)
- 新增 `test/anti-fake.e2e-spec.ts` — 真实 PG e2e

**共享(packages/shared):**
- 新增 `src/dto/anti-fake.dto.ts` — TraceScanItem / AntiFakeAlert / FreezeResponse / 给 public-trace 加 frozen 联合
- 改 `src/dto/public-trace.dto.ts` — 加 `frozen` 判别字段
- 改 `src/index.ts` — 导出新 DTO

**前端(packages/web):**
- 新增 `src/api/anti-fake.ts` — listScans/listAlerts/freezeCode/unfreezeCode
- 新增 `src/api/anti-fake.spec.ts` — 客户端单元
- 改 `src/components/AntiFakeMonitor.tsx` — 去 mock,轮询真实数据,真实冻结
- 改 `src/components/TraceabilityPage.tsx` — 处理 frozen 响应

---

## Task 1: 共享 DTO

**Files:**
- Create: `packages/shared/src/dto/anti-fake.dto.ts`
- Modify: `packages/shared/src/dto/public-trace.dto.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写 anti-fake DTO**

`packages/shared/src/dto/anti-fake.dto.ts`:
```ts
import { z } from 'zod';

export const traceScanItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  batchId: z.string(),
  ip: z.string(),
  userAgent: z.string().nullable(),
  scannedAt: z.string(),
});
export type TraceScanItem = z.infer<typeof traceScanItemSchema>;

export const antiFakeAlertSchema = z.object({
  code: z.string(),
  batchId: z.string(),
  distinctIps: z.number(),
  scanCount: z.number(),
  locations: z.array(z.string()),
  lastScanAt: z.string(),
  frozen: z.boolean(),
});
export type AntiFakeAlert = z.infer<typeof antiFakeAlertSchema>;

export const freezeResponseSchema = z.object({
  code: z.string(),
  frozen: z.boolean(),
});
export type FreezeResponse = z.infer<typeof freezeResponseSchema>;
```

- [ ] **Step 2: 给 public-trace 加 frozen 判别字段**

改 `packages/shared/src/dto/public-trace.dto.ts`,在 `publicTraceResponseSchema` 中加 `frozen` 字段(默认 false,正常响应),并新增冻结响应 schema。把:
```ts
export const publicTraceResponseSchema = z.object({
  code: z.string(),
  scanCount: z.number(),
  batch: publicTraceBatchSchema,
  events: z.array(publicTraceEventSchema),
});
export type PublicTraceResponse = z.infer<typeof publicTraceResponseSchema>;
```
改为:
```ts
export const publicTraceResponseSchema = z.object({
  code: z.string(),
  frozen: z.literal(false),
  scanCount: z.number(),
  batch: publicTraceBatchSchema,
  events: z.array(publicTraceEventSchema),
});
export type PublicTraceResponse = z.infer<typeof publicTraceResponseSchema>;

export const frozenTraceResponseSchema = z.object({
  code: z.string(),
  frozen: z.literal(true),
});
export type FrozenTraceResponse = z.infer<typeof frozenTraceResponseSchema>;

export type PublicTraceResult = PublicTraceResponse | FrozenTraceResponse;
```

- [ ] **Step 3: 导出**

改 `packages/shared/src/index.ts`,在 public-trace 导出块追加 `frozenTraceResponseSchema`、`FrozenTraceResponse`、`PublicTraceResult`,并新增 anti-fake 导出:
```ts
export {
  publicTraceEventSchema,
  publicTraceBatchSchema,
  publicTraceResponseSchema,
  frozenTraceResponseSchema,
} from './dto/public-trace.dto';
export type {
  PublicTraceEvent,
  PublicTraceBatch,
  PublicTraceResponse,
  FrozenTraceResponse,
  PublicTraceResult,
} from './dto/public-trace.dto';

export {
  traceScanItemSchema,
  antiFakeAlertSchema,
  freezeResponseSchema,
} from './dto/anti-fake.dto';
export type { TraceScanItem, AntiFakeAlert, FreezeResponse } from './dto/anti-fake.dto';
```

- [ ] **Step 4: 构建 shared**

Run: `pnpm --filter @nongchang/shared build`
Expected: 无报错,`dist/` 更新。

- [ ] **Step 5: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/shared/src
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(shared): add anti-fake DTOs + frozen trace discriminant"
```

---

## Task 2: Prisma schema 与迁移

**Files:**
- Modify: `packages/backend/prisma/schema.prisma:109-119`(TraceCode)
- Create: `packages/backend/prisma/migrations/<timestamp>_anti_fake/migration.sql`

- [ ] **Step 1: 给 TraceCode 加 status,新增 TraceScan model**

改 `packages/backend/prisma/schema.prisma`。`TraceCode` model 加一行(放在 `scanCount` 后):
```prisma
  status    String   @default("active") @map("status")
```
在 `TraceEvent` model 之后追加:
```prisma
model TraceScan {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  code      String
  batchId   String   @map("batch_id")
  ip        String
  userAgent String?  @map("user_agent")
  scannedAt DateTime @default(now()) @map("scanned_at")

  @@index([tenantId])
  @@index([code, scannedAt])
  @@index([batchId])
  @@map("trace_scans")
}
```

- [ ] **Step 2: 写迁移 SQL**

新建 `packages/backend/prisma/migrations/20260614000000_anti_fake/migration.sql`:
```sql
ALTER TABLE "trace_codes" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "trace_scans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trace_scans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trace_scans_tenant_id_idx" ON "trace_scans"("tenant_id");
CREATE INDEX "trace_scans_code_scanned_at_idx" ON "trace_scans"("code", "scanned_at");
CREATE INDEX "trace_scans_batch_id_idx" ON "trace_scans"("batch_id");
```

- [ ] **Step 3: 应用迁移并生成 client**

Run: `cd packages/backend && pnpm prisma migrate deploy && pnpm prisma generate`
Expected: 迁移 `20260614000000_anti_fake` 已应用;client 重新生成含 `traceScan`。
注意:用 `migrate deploy`(不是 `migrate dev`),避免 PostGIS GIST 索引的无害 DROP INDEX 提示。

- [ ] **Step 4: 编译验证**

Run: `pnpm --filter @nongchang/backend build`
Expected: 无报错(Prisma 类型含 TraceScan、TraceCode.status)。

- [ ] **Step 5: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/prisma
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add TraceScan table + TraceCode.status migration"
```

---
## Task 3: AntiFakeService(检测逻辑,单元 TDD)

**Files:**
- Create: `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`
- Create: `packages/backend/src/modules/anti-fake/anti-fake.service.ts`

检测常量:同一 code 在过去 1 小时(`WINDOW_MS = 3600_000`)内,`distinctIps >= MIN_DISTINCT_IPS(=3)` 且 `scanCount >= MIN_SCANS(=5)` 命中告警。

- [ ] **Step 1: 写失败的单元测试**

`packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AntiFakeService } from './anti-fake.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN };
const merchant: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.MERCHANT, ownerId: 'm1' };

function makeService(prismaOverrides: any) {
  const prisma = {
    traceScan: { findMany: async () => [], ...(prismaOverrides.traceScan ?? {}) },
    traceCode: { findFirst: async () => null, update: async () => ({}), ...(prismaOverrides.traceCode ?? {}) },
  };
  return { svc: new AntiFakeService(prisma as any, new ScopeService()), prisma };
}

describe('AntiFakeService.listScans', () => {
  it('sysadmin 仅按 tenantId 过滤,倒序', async () => {
    let captured: any;
    const { svc } = makeService({
      traceScan: { findMany: async (args: any) => { captured = args; return [
        { id: 's1', code: 'C1', batchId: 'b1', ip: '1.1.1.1', userAgent: 'ua', scannedAt: new Date('2026-06-14T10:00:00Z') },
      ]; } },
    });
    const res = await svc.listScans(sysadmin, 50);
    expect(captured.where).toEqual({ tenantId: 't1' });
    expect(captured.orderBy).toEqual({ scannedAt: 'desc' });
    expect(captured.take).toBe(50);
    expect(res[0]).toEqual({ id: 's1', code: 'C1', batchId: 'b1', ip: '1.1.1.1', userAgent: 'ua', scannedAt: '2026-06-14T10:00:00.000Z' });
  });

  it('merchant 缺 ownerId 时 fail-closed 抛 Forbidden', async () => {
    const { svc } = makeService({});
    await expect(svc.listScans({ userId: 'u', tenantId: 't1', role: Role.MERCHANT } as AuthUser, 50))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AntiFakeService.listAlerts', () => {
  function scan(code: string, ip: string, minutesAgo: number) {
    return { id: code + ip + minutesAgo, code, batchId: 'b-' + code, ip, userAgent: null,
      scannedAt: new Date(Date.now() - minutesAgo * 60_000) };
  }
  it('多 IP 且高频命中告警', async () => {
    const scans = [
      scan('HOT', '1.1.1.1', 5), scan('HOT', '2.2.2.2', 4), scan('HOT', '3.3.3.3', 3),
      scan('HOT', '1.1.1.1', 2), scan('HOT', '2.2.2.2', 1),
    ];
    const { svc } = makeService({
      traceScan: { findMany: async () => scans },
      traceCode: { findFirst: async ({ where }: any) => ({ code: where.code, status: 'active' }) },
    });
    const alerts = await svc.listAlerts(sysadmin);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe('HOT');
    expect(alerts[0].distinctIps).toBe(3);
    expect(alerts[0].scanCount).toBe(5);
    expect(alerts[0].frozen).toBe(false);
  });
  it('单 IP 高频不告警(IP 多样性不足)', async () => {
    const scans = [scan('SOLO','9.9.9.9',5), scan('SOLO','9.9.9.9',4), scan('SOLO','9.9.9.9',3), scan('SOLO','9.9.9.9',2), scan('SOLO','9.9.9.9',1)];
    const { svc } = makeService({ traceScan: { findMany: async () => scans } });
    expect(await svc.listAlerts(sysadmin)).toHaveLength(0);
  });
  it('多 IP 低频不告警(次数不足)', async () => {
    const scans = [scan('LOW','1.1.1.1',5), scan('LOW','2.2.2.2',4), scan('LOW','3.3.3.3',3)];
    const { svc } = makeService({ traceScan: { findMany: async () => scans } });
    expect(await svc.listAlerts(sysadmin)).toHaveLength(0);
  });
});

describe('AntiFakeService.freeze/unfreeze', () => {
  it('作用域内冻结成功置 frozen', async () => {
    let updated: any;
    const { svc } = makeService({
      traceCode: {
        findFirst: async () => ({ id: 'tc1', code: 'C1', status: 'active' }),
        update: async (args: any) => { updated = args; return { code: 'C1', status: 'frozen' }; },
      },
    });
    const res = await svc.freeze(merchant, 'C1');
    expect(updated.data.status).toBe('frozen');
    expect(res).toEqual({ code: 'C1', frozen: true });
  });
  it('越权(码不在作用域)抛 Forbidden', async () => {
    const { svc } = makeService({ traceCode: { findFirst: async () => null } });
    await expect(svc.freeze(merchant, 'OTHER')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('unfreeze 置回 active', async () => {
    const { svc } = makeService({
      traceCode: { findFirst: async () => ({ id: 'tc1', code: 'C1', status: 'frozen' }), update: async () => ({ code: 'C1', status: 'active' }) },
    });
    const res = await svc.unfreeze(merchant, 'C1');
    expect(res).toEqual({ code: 'C1', frozen: false });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/backend && pnpm vitest run src/modules/anti-fake/anti-fake.service.spec.ts`
Expected: FAIL("Cannot find module './anti-fake.service'")。

- [ ] **Step 3: 实现 AntiFakeService**

`packages/backend/src/modules/anti-fake/anti-fake.service.ts`:
```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser, TraceScanItem, AntiFakeAlert, FreezeResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const WINDOW_MS = 3600_000;
const MIN_DISTINCT_IPS = 3;
const MIN_SCANS = 5;

interface ScanRow {
  id: string; code: string; batchId: string; ip: string;
  userAgent: string | null; scannedAt: Date;
}

@Injectable()
export class AntiFakeService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  /** 把业务作用域(ownerId/agentId)转成 TraceScan 的 where。
   *  TraceScan 无 ownerId,故先解析作用域内的 batchId 集合,再按 batchId 过滤。
   *  sysadmin 直接按 tenantId。fail-closed 由 ScopeService 保证。 */
  private async scanWhere(user: AuthUser): Promise<Record<string, unknown>> {
    const owned = await this.scope.ownedScopeWhere(this.prisma, user);
    if (!('ownerId' in owned)) return { tenantId: user.tenantId };
    const batches = await this.prisma.batch.findMany({
      where: owned as any, select: { id: true },
    });
    return { tenantId: user.tenantId, batchId: { in: batches.map((b) => b.id) } };
  }

  async listScans(user: AuthUser, limit: number): Promise<TraceScanItem[]> {
    const where = await this.scanWhere(user);
    const rows = (await this.prisma.traceScan.findMany({
      where, orderBy: { scannedAt: 'desc' }, take: limit,
    })) as ScanRow[];
    return rows.map((r) => ({
      id: r.id, code: r.code, batchId: r.batchId, ip: r.ip,
      userAgent: r.userAgent, scannedAt: r.scannedAt.toISOString(),
    }));
  }

  async listAlerts(user: AuthUser): Promise<AntiFakeAlert[]> {
    const where = { ...(await this.scanWhere(user)), scannedAt: { gte: new Date(Date.now() - WINDOW_MS) } };
    const rows = (await this.prisma.traceScan.findMany({ where })) as ScanRow[];
    const byCode = new Map<string, ScanRow[]>();
    for (const r of rows) {
      const list = byCode.get(r.code) ?? [];
      list.push(r);
      byCode.set(r.code, list);
    }
    const alerts: AntiFakeAlert[] = [];
    for (const [code, list] of byCode) {
      const ips = new Set(list.map((r) => r.ip));
      if (ips.size < MIN_DISTINCT_IPS || list.length < MIN_SCANS) continue;
      const tc = await this.prisma.traceCode.findFirst({ where: { code, tenantId: user.tenantId } });
      const last = list.reduce((a, b) => (a.scannedAt > b.scannedAt ? a : b));
      alerts.push({
        code, batchId: list[0].batchId, distinctIps: ips.size, scanCount: list.length,
        locations: [...ips], lastScanAt: last.scannedAt.toISOString(), frozen: tc?.status === 'frozen',
      });
    }
    return alerts.sort((a, b) => b.scanCount - a.scanCount);
  }

  async freeze(user: AuthUser, code: string): Promise<FreezeResponse> {
    return this.setStatus(user, code, 'frozen');
  }
  async unfreeze(user: AuthUser, code: string): Promise<FreezeResponse> {
    return this.setStatus(user, code, 'active');
  }

  /** 校验该 code 在调用者作用域内(经 batchId 集合),否则 fail-closed 抛 Forbidden。 */
  private async setStatus(user: AuthUser, code: string, status: 'frozen' | 'active'): Promise<FreezeResponse> {
    const where = await this.scanWhere(user);
    const tc = await this.prisma.traceCode.findFirst({
      where: { code, ...(where as object) } as any,
    });
    if (!tc) throw new ForbiddenException('溯源码不在可操作范围内');
    await this.prisma.traceCode.update({ where: { code }, data: { status } });
    return { code, frozen: status === 'frozen' };
  }
}
```
说明:`scanWhere` 对 traceCode 复用同一 where(traceCode 也有 `tenantId`/`batchId`),`findFirst` 命中即证明在作用域内。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/backend && pnpm vitest run src/modules/anti-fake/anti-fake.service.spec.ts`
Expected: PASS(9 tests)。

- [ ] **Step 5: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/src/modules/anti-fake
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): AntiFakeService scans/alerts/freeze with fail-closed scope"
```

---

## Task 4: 公开端点落明细 + frozen 拦截

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.controller.ts`
- Test: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`(若存在则追加用例)

- [ ] **Step 1: 改 service 签名支持落明细 + frozen**

改 `public-trace.service.ts`。`getByCode` 改为接收可选请求元数据并返回联合类型:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicTraceResult } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicTraceService {
  constructor(private prisma: PrismaService) {}

  async getByCode(code: string, meta?: { ip: string; userAgent: string | null }): Promise<PublicTraceResult> {
    const traceCode = await this.prisma.traceCode.findUnique({ where: { code } });
    if (!traceCode) throw new NotFoundException('溯源码不存在');

    if (traceCode.status === 'frozen') {
      return { code: traceCode.code, frozen: true };
    }

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

    if (meta) {
      try {
        await this.prisma.traceScan.create({
          data: {
            tenantId: traceCode.tenantId, code: traceCode.code, batchId: batch.id,
            ip: meta.ip, userAgent: meta.userAgent,
          },
        });
      } catch { /* best-effort:落明细失败不阻断溯源响应 */ }
    }

    return {
      code: traceCode.code,
      frozen: false,
      scanCount: updated.scanCount,
      batch: {
        cropName: batch.cropName,
        batchNo: batch.batchNo,
        plantDate: batch.plantDate.toISOString(),
        expectedHarvest: batch.expectedHarvest.toISOString(),
        status: batch.status as Extract<PublicTraceResult, { frozen: false }>['batch']['status'],
        fieldName: field?.name ?? '',
        region: agent?.region ?? null,
      },
      events: events.map((e) => ({
        type: e.type as Extract<PublicTraceResult, { frozen: false }>['events'][number]['type'],
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

- [ ] **Step 2: 改 controller 采集请求元数据**

改 `public-trace.controller.ts`:
```ts
import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTraceService } from './public-trace.service';

@Controller('public/trace')
export class PublicTraceController {
  constructor(private svc: PublicTraceService) {}

  @Public()
  @Get(':code')
  get(@Param('code') code: string, @Req() req: Request) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]) ?? req.socket.remoteAddress ?? 'unknown';
    const ua = req.headers['user-agent'] ?? null;
    return this.svc.getByCode(code, { ip: ip.trim(), userAgent: ua });
  }
}
```

- [ ] **Step 3: 编译验证**

Run: `pnpm --filter @nongchang/backend build`
Expected: 无报错(联合类型 PublicTraceResult 通过)。

- [ ] **Step 4: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/src/modules/public-trace
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): public trace logs scans + blocks frozen codes"
```

---
## Task 5: AntiFakeController + Module + 注册

**Files:**
- Create: `packages/backend/src/modules/anti-fake/anti-fake.controller.ts`
- Create: `packages/backend/src/modules/anti-fake/anti-fake.module.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: 写 controller**

`packages/backend/src/modules/anti-fake/anti-fake.controller.ts`:
```ts
import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '@nongchang/shared';
import { AntiFakeService } from './anti-fake.service';

@Controller('anti-fake')
export class AntiFakeController {
  constructor(private svc: AntiFakeService) {}

  @Get('scans')
  listScans(@Req() req: Request, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.svc.listScans(req.user as AuthUser, n);
  }

  @Get('alerts')
  listAlerts(@Req() req: Request) {
    return this.svc.listAlerts(req.user as AuthUser);
  }

  @Post('codes/:code/freeze')
  freeze(@Req() req: Request, @Param('code') code: string) {
    return this.svc.freeze(req.user as AuthUser, code);
  }

  @Post('codes/:code/unfreeze')
  unfreeze(@Req() req: Request, @Param('code') code: string) {
    return this.svc.unfreeze(req.user as AuthUser, code);
  }
}
```
说明:`req.user` 由全局 JwtAuthGuard 的 passport 策略注入,与其它受保护 controller 取法一致(参考 batch/field controller 的 `req.user`)。若现有 controller 用的是自定义装饰器(如 `@CurrentUser()`),改用同款装饰器替换 `req.user as AuthUser`。

- [ ] **Step 2: 写 module**

`packages/backend/src/modules/anti-fake/anti-fake.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { AntiFakeService } from './anti-fake.service';
import { AntiFakeController } from './anti-fake.controller';

@Module({
  controllers: [AntiFakeController],
  providers: [AntiFakeService, PrismaService, ScopeService],
})
export class AntiFakeModule {}
```
说明:若 `PrismaService`/`ScopeService` 在项目里是通过全局 module(如 `PrismaModule`/`CommonModule`)提供的,则不要在此重复 provide,改为 `imports: [...]`。先读 `app.module.ts` 与其它 module 确认现有提供方式,照搬。

- [ ] **Step 3: 注册到 AppModule**

改 `packages/backend/src/app.module.ts`,在 `imports` 数组加入 `AntiFakeModule`(import 语句一并加上)。

- [ ] **Step 4: 编译验证**

Run: `pnpm --filter @nongchang/backend build`
Expected: 无报错。

- [ ] **Step 5: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/src
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): wire AntiFakeModule (scans/alerts/freeze endpoints)"
```

---

## Task 6: 后端 e2e(真实 PG)

**Files:**
- Create: `packages/backend/test/anti-fake.e2e-spec.ts`

前置:Docker `nongchang-postgis` 在 localhost:5432 运行(若未启动先 `docker start nongchang-postgis` 等健康)。种子用户密码 `password123`,演示码 `ORC-DEMO0001`(归属某 merchant)。

- [ ] **Step 1: 写 e2e 测试**

`packages/backend/test/anti-fake.e2e-spec.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: INestApplication;

async function login(username: string, password = 'password123'): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ username, password }).expect(201);
  return res.body.accessToken;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('防伪监控(受保护)+ 公开扫码落明细', () => {
  it('公开扫码后,sysadmin 能在 scans 列表看到该次明细', async () => {
    await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    const token = await login('sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/anti-fake/scans?limit=50')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((s: any) => s.code === 'ORC-DEMO0001')).toBe(true);
  });

  it('未登录访问受保护端点返回 401', async () => {
    await request(app.getHttpServer()).get('/api/anti-fake/scans').expect(401);
  });

  it('冻结后公开扫码返回 frozen 标志,解冻后恢复正常', async () => {
    const token = await login('sysadmin');
    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/freeze')
      .set('Authorization', `Bearer ${token}`).expect(201);

    const frozen = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    expect(frozen.body.frozen).toBe(true);
    expect(frozen.body.events).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/unfreeze')
      .set('Authorization', `Bearer ${token}`).expect(201);
    const normal = await request(app.getHttpServer()).get('/api/public/trace/ORC-DEMO0001').expect(200);
    expect(normal.body.frozen).toBe(false);
    expect(normal.body.events.length).toBeGreaterThan(0);
  });

  it('跨租户/越权:merchantA 无法冻结不属于自己作用域的码', async () => {
    // merchantB 的码不在 merchantA 作用域内 → freeze 应被拒(403)
    const tokenA = await login('merchantA');
    await request(app.getHttpServer())
      .post('/api/anti-fake/codes/ORC-DEMO0001/freeze')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect((r) => { if (![403].includes(r.status)) throw new Error('expected 403, got ' + r.status); });
  });
});
```
说明:最后一个用例假设 `ORC-DEMO0001` 不属于 merchantA 作用域。若种子里它正好归属 merchantA,改用 merchantB 登录或换一个其它租户/owner 的码;执行 agent 须先读种子(`prisma/seed.ts`)确认 `ORC-DEMO0001` 归属,选一个确定越权的 (用户, 码) 组合,保证断言成立。freeze/unfreeze 是 `@Post` 无 body,Nest 默认返回 201。

- [ ] **Step 2: 运行 e2e**

Run: `cd packages/backend && pnpm vitest run test/anti-fake.e2e-spec.ts`
Expected: PASS(4 tests)。失败先查容器健康与种子归属。

- [ ] **Step 3: 跑全量后端测试确认不回归**

Run: `cd packages/backend && pnpm test`
Expected: PASS(原 43 + 新增 9 单元 + 4 e2e = 56)。注意 public-trace 原 e2e 仍须绿(scanCount 自增、404、脱敏不含 batchId —— 新响应体 `frozen:false` 不含 batchId,脱敏断言不破)。

- [ ] **Step 4: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/test
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "test(backend): anti-fake e2e (scan logging, freeze, cross-scope deny)"
```

---

## Task 7: 前端 API 客户端 + 单元测试

**Files:**
- Create: `packages/web/src/api/anti-fake.ts`
- Create: `packages/web/src/api/anti-fake.spec.ts`

- [ ] **Step 1: 写客户端**

`packages/web/src/api/anti-fake.ts`(模块级稳定函数,配合 useApi):
```ts
import type { TraceScanItem, AntiFakeAlert, FreezeResponse } from '@nongchang/shared';
import { request } from './request';

export function listScans(): Promise<TraceScanItem[]> {
  return request<TraceScanItem[]>('/anti-fake/scans?limit=50');
}

export function listAlerts(): Promise<AntiFakeAlert[]> {
  return request<AntiFakeAlert[]>('/anti-fake/alerts');
}

export function freezeCode(code: string): Promise<FreezeResponse> {
  return request<FreezeResponse>(`/anti-fake/codes/${encodeURIComponent(code)}/freeze`, { method: 'POST' });
}

export function unfreezeCode(code: string): Promise<FreezeResponse> {
  return request<FreezeResponse>(`/anti-fake/codes/${encodeURIComponent(code)}/unfreeze`, { method: 'POST' });
}
```
说明:`request` 内部自动加 `/api` 前缀并注入 JWT,故 path 写 `/anti-fake/...`。

- [ ] **Step 2: 写单元测试(mock request 模块)**

`packages/web/src/api/anti-fake.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { listScans, listAlerts, freezeCode, unfreezeCode } from './anti-fake';

beforeEach(() => requestMock.mockReset().mockResolvedValue([]));

describe('anti-fake api client', () => {
  it('listScans 调用 GET /anti-fake/scans?limit=50', async () => {
    await listScans();
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/scans?limit=50');
  });
  it('listAlerts 调用 GET /anti-fake/alerts', async () => {
    await listAlerts();
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/alerts');
  });
  it('freezeCode POST 且对 code 转义', async () => {
    requestMock.mockResolvedValue({ code: 'A B', frozen: true });
    await freezeCode('A B');
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/codes/A%20B/freeze', { method: 'POST' });
  });
  it('unfreezeCode POST', async () => {
    requestMock.mockResolvedValue({ code: 'C1', frozen: false });
    await unfreezeCode('C1');
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/codes/C1/unfreeze', { method: 'POST' });
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `cd packages/web && pnpm vitest run src/api/anti-fake.spec.ts`
Expected: PASS(4 tests)。

- [ ] **Step 4: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/api/anti-fake.ts packages/web/src/api/anti-fake.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add anti-fake api client + unit tests"
```

---

## Task 8: AntiFakeMonitor 切真实 + TraceabilityPage 处理 frozen

**Files:**
- Modify: `packages/web/src/components/AntiFakeMonitor.tsx`(全量重写,见下)
- Modify: `packages/web/src/components/TraceabilityPage.tsx`

- [ ] **Step 1: 重写 AntiFakeMonitor.tsx**

全量替换 `packages/web/src/components/AntiFakeMonitor.tsx`(去 MOCK_SCANS、去 setInterval 模拟、去 DemoBadge;改 useApi + 10s 轮询 reload + 真实 freeze/unfreeze):
```tsx
import { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, MapPin, ShieldAlert, Activity, CheckCircle, RefreshCw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { listScans, listAlerts, freezeCode, unfreezeCode } from '../api/anti-fake';

export default function AntiFakeMonitor() {
  const { data: scans, loading: scansLoading, error: scansError, reload: reloadScans } = useApi(listScans);
  const { data: alerts, error: alertsError, reload: reloadAlerts } = useApi(listAlerts);
  const [toastMessage, setToastMessage] = useState('');

  const reloadAll = useCallback(() => { void reloadScans(); void reloadAlerts(); }, [reloadScans, reloadAlerts]);

  useEffect(() => {
    const t = setInterval(reloadAll, 10_000);
    return () => clearInterval(t);
  }, [reloadAll]);

  const showToast = (m: string) => { setToastMessage(m); setTimeout(() => setToastMessage(''), 3000); };

  const handleFreeze = async (code: string) => {
    try { await freezeCode(code); showToast(`已冻结溯源码 [${code}]，公开溯源将被拦截`); reloadAll(); }
    catch (e) { showToast(e instanceof Error ? e.message : '冻结失败'); }
  };
  const handleUnfreeze = async (code: string) => {
    try { await unfreezeCode(code); showToast(`已解冻溯源码 [${code}]`); reloadAll(); }
    catch (e) { showToast(e instanceof Error ? e.message : '解冻失败'); }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="w-full md:w-1/3 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            溯源防伪监控看板
          </h3>
          <button onClick={reloadAll} aria-label="刷新监控数据"
            className="text-[10px] px-2 py-1 rounded border font-bold flex items-center gap-1 bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100">
            <RefreshCw className="w-3 h-3" /> 刷新
          </button>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex-1 overflow-y-auto">
          <h4 className="text-xs font-bold text-red-800 mb-3 flex items-center gap-1"><AlertOctagon className="w-4 h-4" /> 异常高频/异地扫码预警</h4>
          {alertsError ? (
            <div className="text-sm text-red-500 p-2">加载告警失败：{alertsError.message}</div>
          ) : (alerts ?? []).length === 0 ? (
            <div className="text-sm text-red-400 flex flex-col items-center justify-center p-4">
              <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
              暂未监测到异常复用
            </div>
          ) : (
            <div className="space-y-3">
              {(alerts ?? []).map((alert) => (
                <div key={alert.code} className="bg-white p-3 rounded shadow-sm border border-red-200">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-red-700 font-bold text-xs">{alert.code}</span>
                    <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{alert.frozen ? '已冻结' : '疑防造假'}</span>
                  </div>
                  <p className="text-[10px] text-slate-600">时间窗内被扫描 <span className="font-bold text-red-600">{alert.scanCount}</span> 次 · <span className="font-bold text-red-600">{alert.distinctIps}</span> 个不同 IP</p>
                  <div className="mt-2 text-[10px] text-slate-500 flex gap-1 items-start">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {alert.locations.map((l, idx) => <span key={idx} className="bg-slate-100 px-1 rounded font-mono">{l}</span>)}
                    </div>
                  </div>
                  {alert.frozen ? (
                    <button onClick={() => handleUnfreeze(alert.code)} className="mt-2 w-full text-[10px] bg-slate-600 hover:bg-slate-700 text-white py-1 rounded font-medium transition-colors">解冻该溯源码</button>
                  ) : (
                    <button onClick={() => handleFreeze(alert.code)} className="mt-2 w-full text-[10px] bg-red-600 hover:bg-red-700 text-white py-1 rounded font-medium transition-colors">冻结该溯源码</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full md:w-2/3 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" /> 全网一物一码实时扫码日志</h4>
        </div>
        <div className="flex-1 overflow-y-auto pr-2">
          {scansError ? (
            <div className="text-sm text-red-500 p-2">加载扫码日志失败：{scansError.message}</div>
          ) : scansLoading && !scans ? (
            <div className="text-sm text-slate-400 p-4">加载中…</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3 font-medium">标签流水号</th>
                  <th className="py-2 px-3 font-medium">发生时间</th>
                  <th className="py-2 px-3 font-medium">终端IP</th>
                  <th className="py-2 px-3 font-medium">终端标识</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(scans ?? []).map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-medium">{scan.code}</td>
                    <td className="py-2 px-3">{new Date(scan.scannedAt).toLocaleString()}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{scan.ip}</td>
                    <td className="py-2 px-3 text-slate-400 truncate max-w-[200px]">{scan.userAgent ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
```
说明:确认 `useApi` 返回 `{ data, loading, error, reload }`(参考 `src/hooks/useApi.ts` 与既有用法);若字段名不同,按实际调整。地图 SVG 已随重写移除(原本就是装饰),如需保留可后续加。

- [ ] **Step 2: TraceabilityPage 处理 frozen 响应**

读 `packages/web/src/components/TraceabilityPage.tsx`,在解析公开溯源响应处:当 `result.frozen === true` 时,渲染「该溯源码已被冻结，疑似异常，请谨慎辨别」的提示页(复用现有 404/降级页的容器样式),不渲染正常的批次/事件区。用判别字段 `frozen` 区分两种响应类型(`PublicTraceResult` 联合)。具体:把现有 `fetch → setData` 流程的 data 类型改为 `PublicTraceResult`;渲染前先 `if (data.frozen) return <冻结提示页/>;`。保持现有 alive 卸载守卫与 404/降级逻辑不变。

- [ ] **Step 3: lint + 单测**

Run: `cd packages/web && pnpm lint && pnpm test`
Expected: lint 无报错;测试全绿(原 16 + 新增 anti-fake 4 = 20)。

- [ ] **Step 4: 提交**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/AntiFakeMonitor.tsx packages/web/src/components/TraceabilityPage.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): real-data AntiFakeMonitor (poll + freeze) + frozen trace page"
```

---

## Task 9: 全量验证

**Files:** 无(仅验证)

- [ ] **Step 1: shared 构建**

Run: `pnpm --filter @nongchang/shared build`
Expected: 无报错。

- [ ] **Step 2: 后端构建 + 全量测试**

Run: `pnpm --filter @nongchang/backend build && cd packages/backend && pnpm test`
Expected: 构建无报错;测试 56/56(43 原 + 9 单元 + 4 e2e)。需 Docker `nongchang-postgis` 运行。

- [ ] **Step 3: web lint + 构建 + 测试**

Run: `cd packages/web && pnpm lint && pnpm build && pnpm test`
Expected: 全绿;测试 20/20。

- [ ] **Step 4: 人工联调清单(human-in-loop,不自动化)**

记录给用户手动验证:
- sysadmin 登录 → 进入防伪监控屏 → 扫码日志加载真实数据、10s 自动刷新。
- 用消费者溯源页扫 `ORC-DEMO0001` 多次 → 监控屏 scans 出现该记录。
- 点「冻结」→ 再扫该码 → 溯源页显示冻结提示。
- 点「解冻」→ 再扫 → 溯源页恢复正常。
- merchant 登录只看到自己批次的扫码/告警(作用域)。

- [ ] **Step 5: 最终复审 + 收尾**

全部任务完成后:派一个整体 code review(superpowers:requesting-code-review),修正问题,再用 superpowers:finishing-a-development-branch 收尾分支 `feat/anti-fake-monitor`。


