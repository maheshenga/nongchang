# 后端地基(SaaS Core)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建多租户 SaaS 后端地基:NestJS + PostgreSQL + Prisma,含 JWT 认证、多租户行级隔离、RBAC 数据范围过滤,以及各核心实体的基础 CRUD。

**Architecture:** pnpm workspace monorepo,`packages/shared` 放全端共享 TS 类型与 zod DTO,`packages/backend` 为 NestJS 模块化单体。认证签发携带 `tenantId/role/agentId/ownerId` 的 JWT;租户上下文经 nestjs-cls 注入;`ScopeService` 在服务层按角色自动追加 where 条件实现三级数据隔离(system_admin / agent_admin / merchant)。

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL(PostGIS), zod, bcrypt, @nestjs/jwt, nestjs-cls, Vitest, Supertest, pnpm workspace。

参考 spec:`docs/superpowers/specs/2026-06-13-saas-core-backend-design.md`

> **计划修订(2026-06-13,基于 Task 1 代码评审)**:
> 1. `@nongchang/shared` 产出 **CommonJS**(不再 `type: module`),与 backend 的 CJS 运行时一致,消除 ESM/CJS 边界风险。
> 2. 所有相对导入使用**无扩展名**写法(如 `from './prisma.service'`,而非 `./prisma.service.js`),适配 CJS + moduleResolution node。下文各任务代码块如出现 `.js` 扩展名,实现时一律去掉。
> 3. backend 增加 `unplugin-swc` + `@swc/core`,vitest 经 swc 转换以产出 NestJS DI 所需的装饰器元数据(否则 Task 12 e2e 的 `Test.createTestingModule` 无法解析 provider)。

---

## File Structure

Monorepo 根:
- `pnpm-workspace.yaml` — workspace 声明
- `package.json` — 根脚本与共享 devDeps

`packages/shared/`(@nongchang/shared):
- `src/enums/index.ts` — Role / BatchStatus / TraceEventType / FarmRecordSource 枚举
- `src/dto/auth.dto.ts` — 登录/刷新 zod schema + 推导类型
- `src/dto/*.dto.ts` — 各实体的 create/update zod schema
- `src/types/index.ts` — 实体出参类型
- `src/index.ts` — 统一导出

`packages/backend/`(@nongchang/backend):
- `prisma/schema.prisma` — 数据模型
- `prisma/seed.ts` — 种子数据(2 代理商 + 旗下商家,供越权测试)
- `src/main.ts` / `src/app.module.ts`
- `src/prisma/prisma.service.ts`
- `src/common/cls/tenant-context.ts` — 请求上下文(tenantId/userId/role/agentId/ownerId)
- `src/common/scope/scope.service.ts` — 按角色生成 where 过滤
- `src/common/guards/jwt-auth.guard.ts` / `roles.guard.ts`
- `src/common/decorators/roles.decorator.ts` / `current-user.decorator.ts`
- `src/modules/auth/` — controller/service/strategy
- `src/modules/{user,agent,field,batch,farm-record,trace}/` — 每个含 controller/service
- `test/` — 集成与 e2e 测试

---

## Task 1: Monorepo 脚手架

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`(根), `packages/shared/package.json`, `packages/backend/package.json`, `packages/shared/tsconfig.json`, `packages/backend/tsconfig.json`

- [ ] **Step 1: workspace 声明** — `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2: 根 package.json**
```json
{
  "name": "nongchang",
  "private": true,
  "scripts": {
    "build:shared": "pnpm --filter @nongchang/shared build",
    "build:backend": "pnpm --filter @nongchang/backend build",
    "test": "pnpm --filter @nongchang/backend test"
  },
  "devDependencies": { "typescript": "~5.8.2" }
}
```

- [ ] **Step 3: shared package.json**
```json
{
  "name": "@nongchang/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": { "zod": "^3.23.8" }
}
```

- [ ] **Step 4: backend package.json**
```json
{
  "name": "@nongchang/backend",
  "version": "0.0.0",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.4.0",
    "@nongchang/shared": "workspace:*",
    "@prisma/client": "^5.18.0",
    "bcrypt": "^5.1.1",
    "nestjs-cls": "^4.4.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/testing": "^10.4.0",
    "@types/bcrypt": "^5.0.2",
    "@types/node": "^22.14.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.18.0",
    "supertest": "^7.0.0",
    "tsx": "^4.21.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 5: tsconfig**

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "declaration": true, "outDir": "dist", "strict": true,
    "esModuleInterop": true, "skipLibCheck": true
  },
  "include": ["src"]
}
```

`packages/backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "commonjs", "moduleResolution": "node",
    "experimentalDecorators": true, "emitDecoratorMetadata": true,
    "outDir": "dist", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "baseUrl": "."
  },
  "include": ["src", "prisma", "test"]
}
```

- [ ] **Step 6: 安装并提交**

Run: `pnpm install`
Expected: `@nongchang/shared` 以 workspace:* 链接进 backend,无错误。
```bash
git add pnpm-workspace.yaml package.json packages/*/package.json packages/*/tsconfig.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with shared and backend packages"
```

## Task 2: shared 包 — 枚举与 DTO

**Files:**
- Create: `packages/shared/src/enums/index.ts`, `src/dto/auth.dto.ts`, `src/dto/entities.dto.ts`, `src/types/index.ts`, `src/index.ts`

- [ ] **Step 1: 枚举** — `packages/shared/src/enums/index.ts`:
```typescript
export const Role = {
  SYSTEM_ADMIN: 'system_admin', AGENT_ADMIN: 'agent_admin', MERCHANT: 'merchant',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const BatchStatus = {
  PLANTING: 'Planting', GROWING: 'Growing', HARVESTED: 'Harvested', DISTRIBUTED: 'Distributed',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const TraceEventType = {
  ORIGIN: 'origin', FARM: 'farm', HARVEST: 'harvest',
  WAREHOUSE: 'warehouse', LOGISTICS: 'logistics', RETAIL: 'retail',
} as const;
export type TraceEventType = (typeof TraceEventType)[keyof typeof TraceEventType];

export const FarmRecordSource = {
  WEB: 'web', MINIAPP: 'miniapp', VOICE: 'voice',
} as const;
export type FarmRecordSource = (typeof FarmRecordSource)[keyof typeof FarmRecordSource];
```

- [ ] **Step 2: auth DTO** — `packages/shared/src/dto/auth.dto.ts`:
```typescript
import { z } from 'zod';
export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export type RefreshDto = z.infer<typeof refreshSchema>;
```

- [ ] **Step 3: 实体 DTO** — `packages/shared/src/dto/entities.dto.ts`:
```typescript
import { z } from 'zod';
import { BatchStatus, FarmRecordSource, Role, TraceEventType } from '../enums/index.js';

export const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
  role: z.enum([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT]),
  agentId: z.string().uuid().nullable().optional(),
  phone: z.string().max(20).optional(),
  displayName: z.string().max(64),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const createAgentSchema = z.object({
  name: z.string().min(1).max(128),
  region: z.string().max(64),
});
export type CreateAgentDto = z.infer<typeof createAgentSchema>;

export const createFieldSchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(128),
  area: z.number().positive(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  iotDeviceId: z.string().max(64).nullable().optional(),
});
export type CreateFieldDto = z.infer<typeof createFieldSchema>;

export const createBatchSchema = z.object({
  ownerId: z.string().uuid(),
  fieldId: z.string().uuid(),
  batchNo: z.string().min(1).max(64),
  cropName: z.string().min(1).max(128),
  plantDate: z.string().datetime(),
  expectedHarvest: z.string().datetime(),
  status: z.enum([BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED]),
});
export type CreateBatchDto = z.infer<typeof createBatchSchema>;

export const createFarmRecordSchema = z.object({
  batchId: z.string().uuid(),
  fieldId: z.string().uuid(),
  action: z.string().min(1).max(128),
  detail: z.record(z.unknown()).optional(),
  images: z.array(z.string().url()).optional(),
  location: z.string().max(128).optional(),
  recordedAt: z.string().datetime(),
  source: z.enum([FarmRecordSource.WEB, FarmRecordSource.MINIAPP, FarmRecordSource.VOICE]),
});
export type CreateFarmRecordDto = z.infer<typeof createFarmRecordSchema>;

export const createTraceEventSchema = z.object({
  batchId: z.string().uuid(),
  type: z.enum([TraceEventType.ORIGIN, TraceEventType.FARM, TraceEventType.HARVEST, TraceEventType.WAREHOUSE, TraceEventType.LOGISTICS, TraceEventType.RETAIL]),
  title: z.string().min(1).max(128),
  actor: z.string().max(128),
  location: z.string().max(128),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()).optional(),
});
export type CreateTraceEventDto = z.infer<typeof createTraceEventSchema>;
```

- [ ] **Step 4: 出参类型与导出**

`packages/shared/src/types/index.ts`:
```typescript
import { Role } from '../enums/index.js';
export interface AuthUser {
  userId: string; tenantId: string; role: Role;
  agentId: string | null; ownerId: string | null;
}
export interface TokenPair { accessToken: string; refreshToken: string; }
```

`packages/shared/src/index.ts`:
```typescript
export * from './enums/index.js';
export * from './dto/auth.dto.js';
export * from './dto/entities.dto.js';
export * from './types/index.js';
```

- [ ] **Step 5: 构建并提交**

Run: `pnpm --filter @nongchang/shared build`
Expected: `dist/index.js` 与 `.d.ts` 生成,无类型错误。
```bash
git add packages/shared/src
git commit -m "feat(shared): add enums, zod DTOs and shared types"
```

## Task 3: Prisma schema 与首个迁移

**Files:**
- Create: `packages/backend/prisma/schema.prisma`, `packages/backend/.env`, `packages/backend/.env.example`

- [ ] **Step 1: 写 schema** — `packages/backend/prisma/schema.prisma`:
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Tenant {
  id        String   @id @default(uuid())
  name      String
  status    String   @default("active")
  createdAt DateTime @default(now()) @map("created_at")
  users     User[]
  agents    Agent[]
  @@map("tenants")
}

model Agent {
  id       String @id @default(uuid())
  tenantId String @map("tenant_id")
  name     String
  region   String
  status   String @default("active")
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  users    User[]
  @@index([tenantId])
  @@map("agents")
}

model User {
  id           String   @id @default(uuid())
  tenantId     String   @map("tenant_id")
  role         String
  agentId      String?  @map("agent_id")
  username     String   @unique
  passwordHash String   @map("password_hash")
  phone        String?
  wxOpenid     String?  @unique @map("wx_openid")
  displayName  String   @map("display_name")
  status       String   @default("active")
  createdAt    DateTime @default(now()) @map("created_at")
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  agent        Agent?   @relation(fields: [agentId], references: [id])
  @@index([tenantId])
  @@index([agentId])
  @@map("users")
}

model Field {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  ownerId     String   @map("owner_id")
  name        String
  area        Float
  iotDeviceId String?  @map("iot_device_id")
  // PostGIS geography(Point,4326);Prisma 不原生支持,迁移后用原生 SQL 补列与索引
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@index([ownerId])
  @@map("fields")
}

model Batch {
  id              String   @id @default(uuid())
  tenantId        String   @map("tenant_id")
  ownerId         String   @map("owner_id")
  fieldId         String   @map("field_id")
  batchNo         String   @map("batch_no")
  cropName        String   @map("crop_name")
  plantDate       DateTime @map("plant_date")
  expectedHarvest DateTime @map("expected_harvest")
  status          String
  createdAt       DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@index([ownerId])
  @@map("batches")
}

model FarmRecord {
  id         String   @id @default(uuid())
  tenantId   String   @map("tenant_id")
  batchId    String   @map("batch_id")
  fieldId    String   @map("field_id")
  operatorId String   @map("operator_id")
  action     String
  detail     Json?
  images     Json?
  location   String?
  recordedAt DateTime @map("recorded_at")
  source     String
  createdAt  DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@index([batchId])
  @@map("farm_records")
}

model TraceCode {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  batchId   String   @map("batch_id")
  code      String   @unique
  scanCount Int      @default(0) @map("scan_count")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@map("trace_codes")
}

model TraceEvent {
  id         String   @id @default(uuid())
  tenantId   String   @map("tenant_id")
  batchId    String   @map("batch_id")
  type       String
  title      String
  actor      String
  location   String
  occurredAt DateTime @map("occurred_at")
  payload    Json?
  createdAt  DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@index([batchId])
  @@map("trace_events")
}
```

- [ ] **Step 2: .env 与 .env.example**

`packages/backend/.env`(本地,勿提交):
```
DATABASE_URL="postgresql://nongchang:nongchang@localhost:5432/nongchang?schema=public"
JWT_SECRET="dev-access-secret-change-me"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me"
WX_APPID=""
WX_SECRET=""
GEMINI_API_KEY=""
```
`packages/backend/.env.example`:同上但所有值留空。确认根 `.gitignore` 含 `.env`。

- [ ] **Step 3: 生成迁移**

Run: `pnpm --filter @nongchang/backend exec prisma migrate dev --name init`
Expected: 在 `prisma/migrations/` 生成 init 迁移并应用到本地库,`@prisma/client` 生成成功。
(前置:本地 PostgreSQL 已按 DATABASE_URL 建好库与用户)

- [ ] **Step 4: 追加 PostGIS 地理列(原生 SQL 迁移)**

Run: `pnpm --filter @nongchang/backend exec prisma migrate dev --create-only --name field_geography`
然后编辑新建的迁移 SQL 文件,写入:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE fields ADD COLUMN location geography(Point, 4326);
CREATE INDEX fields_location_gist ON fields USING GIST (location);
```
再 Run: `pnpm --filter @nongchang/backend exec prisma migrate dev`
Expected: 迁移应用成功,fields 表含 location 地理列。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/prisma packages/backend/.env.example
git commit -m "feat(backend): add prisma schema, init migration and PostGIS location column"
```

---

## Task 4: PrismaService 与种子数据

**Files:**
- Create: `packages/backend/src/prisma/prisma.service.ts`, `packages/backend/src/prisma/prisma.module.ts`, `packages/backend/prisma/seed.ts`

- [ ] **Step 1: PrismaService**

`packages/backend/src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

`packages/backend/src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 2: 种子数据(供越权测试)**

`packages/backend/prisma/seed.ts`:
```typescript
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
```

- [ ] **Step 3: 运行种子并提交**

Run: `pnpm --filter @nongchang/backend prisma:seed`
Expected: 打印 Seed done 及各 id,无错误。
```bash
git add packages/backend/src/prisma packages/backend/prisma/seed.ts
git commit -m "feat(backend): add PrismaService, PrismaModule and seed data for tenancy tests"
```

## Task 5: 租户上下文与 ScopeService(核心,TDD)

ScopeService 把"当前用户能看哪些数据"的规则集中到一处,是防越权的关键。先写测试。

**Files:**
- Create: `packages/backend/src/common/cls/tenant-context.ts`, `packages/backend/src/common/scope/scope.service.ts`, `packages/backend/src/common/scope/scope.service.spec.ts`
- Create: `packages/backend/vitest.config.ts`

- [ ] **Step 1: vitest 配置**

`packages/backend/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'] },
});
```

- [ ] **Step 2: 租户上下文类型** — `packages/backend/src/common/cls/tenant-context.ts`:
```typescript
import { AuthUser } from '@nongchang/shared';
export type TenantContext = AuthUser;
export const CLS_USER_KEY = 'authUser';
```

- [ ] **Step 3: 写失败测试** — `packages/backend/src/common/scope/scope.service.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ScopeService } from './scope.service';
import { Role } from '@nongchang/shared';

const svc = new ScopeService();
const ctx = (over: Partial<any>) => ({ userId: 'u', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: null, ...over });

describe('ScopeService.ownedWhere', () => {
  it('system_admin 仅按 tenantId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }))).toEqual({ tenantId: 't1' });
  });
  it('agent_admin 按 tenantId + agentId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({ tenantId: 't1', agentId: 'a1' });
  });
  it('merchant 按 tenantId + ownerId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({ tenantId: 't1', ownerId: 'm1' });
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm --filter @nongchang/backend exec vitest run src/common/scope/scope.service.spec.ts`
Expected: FAIL — ScopeService 未定义。

- [ ] **Step 5: 实现 ScopeService** — `packages/backend/src/common/scope/scope.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthUser, Role } from '@nongchang/shared';

@Injectable()
export class ScopeService {
  /** 用于按归属过滤业务表(fields/batches 等带 ownerId/agentId 的表)。 */
  ownedWhere(user: AuthUser): Record<string, string> {
    const where: Record<string, string> = { tenantId: user.tenantId };
    if (user.role === Role.AGENT_ADMIN && user.agentId) where.agentId = user.agentId;
    if (user.role === Role.MERCHANT && user.ownerId) where.ownerId = user.ownerId;
    return where;
  }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter @nongchang/backend exec vitest run src/common/scope/scope.service.spec.ts`
Expected: PASS(3 个用例)。

- [ ] **Step 7: 提交**
```bash
git add packages/backend/src/common packages/backend/vitest.config.ts
git commit -m "feat(backend): add ScopeService with role-based data scope filtering (tested)"
```

> 注:`fields`/`batches` 表无 `agentId` 列,代理商按 agent 过滤需经 owner 关联。本任务先实现直接归属场景;agent_admin 对地块/批次的过滤在 Task 9 的 service 中以 `ownerId in (该 agent 下的 merchant ids)` 形式落地,届时复用 ScopeService 提供的 helper。

---

## Task 6: JWT Guard、Roles Guard 与装饰器

**Files:**
- Create: `packages/backend/src/common/decorators/roles.decorator.ts`, `current-user.decorator.ts`
- Create: `packages/backend/src/common/guards/jwt-auth.guard.ts`, `roles.guard.ts`
- Create: `packages/backend/src/auth/jwt.strategy.ts`

- [ ] **Step 1: @Roles 装饰器** — `packages/backend/src/common/decorators/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '@nongchang/shared';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 2: @CurrentUser 装饰器** — `packages/backend/src/common/decorators/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@nongchang/shared';
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
```

- [ ] **Step 3: JWT Strategy** — `packages/backend/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '@nongchang/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }
  async validate(payload: AuthUser & { sub: string }): Promise<AuthUser> {
    return {
      userId: payload.userId, tenantId: payload.tenantId, role: payload.role,
      agentId: payload.agentId ?? null, ownerId: payload.ownerId ?? null,
    };
  }
}
```

- [ ] **Step 4: Guards**

`packages/backend/src/common/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`packages/backend/src/common/guards/roles.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@nongchang/shared';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user;
    if (!user || !required.includes(user.role)) throw new ForbiddenException('角色无权访问');
    return true;
  }
}
```

- [ ] **Step 5: 提交**
```bash
git add packages/backend/src/common packages/backend/src/auth/jwt.strategy.ts
git commit -m "feat(backend): add JWT strategy, auth/roles guards and decorators"
```

## Task 7: Auth 模块(登录 / 刷新,TDD)

**Files:**
- Create: `packages/backend/src/auth/auth.service.ts`, `auth.service.spec.ts`, `auth.controller.ts`, `auth.module.ts`

- [ ] **Step 1: 写失败测试** — `packages/backend/src/auth/auth.service.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

const makeService = (user: any) => {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
  const jwt = new JwtService({ secret: 'test' });
  return new AuthService(prisma, jwt);
};

describe('AuthService.login', () => {
  it('密码正确时返回 token 对', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: 'a1', passwordHash: hash });
    const res = await svc.login({ username: 'merchantA', password: 'password123' });
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
  });
  it('密码错误时抛 Unauthorized', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, passwordHash: hash });
    await expect(svc.login({ username: 'x', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('用户不存在时抛 Unauthorized', async () => {
    const svc = makeService(null);
    await expect(svc.login({ username: 'none', password: 'password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @nongchang/backend exec vitest run src/auth/auth.service.spec.ts`
Expected: FAIL — AuthService 未定义。

- [ ] **Step 3: 实现 AuthService** — `packages/backend/src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto, TokenPair, AuthUser, Role } from '@nongchang/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const authUser: AuthUser = {
      userId: user.id, tenantId: user.tenantId, role: user.role as Role,
      agentId: user.agentId ?? null,
      ownerId: user.role === Role.MERCHANT ? user.id : null,
    };
    return this.issueTokens(authUser);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const authUser: AuthUser = {
        userId: payload.userId, tenantId: payload.tenantId, role: payload.role,
        agentId: payload.agentId ?? null, ownerId: payload.ownerId ?? null,
      };
      return this.issueTokens(authUser);
    } catch {
      throw new UnauthorizedException('刷新令牌无效');
    }
  }

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(user, {
      secret: process.env.JWT_SECRET, expiresIn: '2h',
    });
    const refreshToken = await this.jwt.signAsync(user, {
      secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d',
    });
    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @nongchang/backend exec vitest run src/auth/auth.service.spec.ts`
Expected: PASS(3 用例)。

- [ ] **Step 5: Controller 与 Module**

`packages/backend/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { loginSchema, refreshSchema } from '@nongchang/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: any) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: any) {
    return this.auth.refresh(dto.refreshToken);
  }
}
```

`packages/backend/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
```

- [ ] **Step 6: 提交**
```bash
git add packages/backend/src/auth
git commit -m "feat(backend): add auth module with JWT login and refresh (tested)"
```

---

## Task 8: Zod 校验管道与应用引导

**Files:**
- Create: `packages/backend/src/common/pipes/zod-validation.pipe.ts`, `src/app.module.ts`, `src/main.ts`

- [ ] **Step 1: Zod 校验管道** — `packages/backend/src/common/pipes/zod-validation.pipe.ts`:
```typescript
import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
    }
    return result.data;
  }
}
```

- [ ] **Step 2: AppModule** — `packages/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ScopeService } from './common/scope/scope.service.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { UserModule } from './modules/user/user.module.js';
import { AgentModule } from './modules/agent/agent.module.js';
import { FieldModule } from './modules/field/field.module.js';
import { BatchModule } from './modules/batch/batch.module.js';
import { FarmRecordModule } from './modules/farm-record/farm-record.module.js';
import { TraceModule } from './modules/trace/trace.module.js';

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule, AuthModule,
    UserModule, AgentModule, FieldModule, BatchModule, FarmRecordModule, TraceModule,
  ],
  providers: [
    ScopeService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

> 全局挂 JwtAuthGuard:默认所有路由需登录。公开路由(如子项目 2 的溯源)后续用 `@Public()` 跳过。ScopeService 设为全局 provider 供各模块注入。

- [ ] **Step 3: main.ts** — `packages/backend/src/main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001, '0.0.0.0');
}
bootstrap();
```

- [ ] **Step 4: 构建验证**

Run: `pnpm --filter @nongchang/backend build`
Expected: 编译成功(此时 modules/* 尚未建,故本步骤在 Task 9 之后才会整体通过;若先行,可暂时注释未建模块的 import)。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/src/common/pipes packages/backend/src/app.module.ts packages/backend/src/main.ts
git commit -m "feat(backend): add zod validation pipe and app bootstrap with global guards"
```

## Task 9: Agent 模块(代理商 + 旗下农户,TDD)

代理商模块体现核心隔离:agent_admin 只能管理自己旗下的 merchant。

**Files:**
- Create: `packages/backend/src/modules/agent/agent.service.ts`, `agent.service.spec.ts`, `agent.controller.ts`, `agent.module.ts`

- [ ] **Step 1: 写失败测试** — `agent.service.spec.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentService } from './agent.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '@nongchang/shared';

const ctx = (o: Partial<any>) => ({ userId: 'u', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null, ...o });

describe('AgentService.listMerchants', () => {
  it('agent_admin 仅查询自己 agentId 下的 merchant', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    await svc.listMerchants(ctx({}));
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT, agentId: 'a1' },
    });
  });
  it('system_admin 查询全租户 merchant(不限 agentId)', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    await svc.listMerchants(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT },
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @nongchang/backend exec vitest run src/modules/agent/agent.service.spec.ts`
Expected: FAIL — AgentService 未定义。

- [ ] **Step 3: 实现 AgentService** — `agent.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthUser, CreateAgentDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Injectable()
export class AgentService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateAgentDto) {
    return this.prisma.agent.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  list(user: AuthUser) {
    return this.prisma.agent.findMany({ where: { tenantId: user.tenantId } });
  }

  listMerchants(user: AuthUser) {
    const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
    if (user.role === Role.AGENT_ADMIN && user.agentId) where.agentId = user.agentId;
    return this.prisma.user.findMany({ where });
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @nongchang/backend exec vitest run src/modules/agent/agent.service.spec.ts`
Expected: PASS(2 用例)。

- [ ] **Step 5: Controller 与 Module**

`agent.controller.ts`:
```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { createAgentSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AgentService } from './agent.service.js';

@Controller('agents')
export class AgentController {
  constructor(private svc: AgentService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN)
  create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createAgentSchema)) dto: any) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN)
  list(@CurrentUser() user: any) { return this.svc.list(user); }

  @Get('merchants') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  merchants(@CurrentUser() user: any) { return this.svc.listMerchants(user); }
}
```

`agent.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { AgentController } from './agent.controller.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Module({ providers: [AgentService, ScopeService], controllers: [AgentController] })
export class AgentModule {}
```

- [ ] **Step 6: 提交**
```bash
git add packages/backend/src/modules/agent
git commit -m "feat(backend): add agent module with scoped merchant listing (tested)"
```

## Task 10: 归属过滤 helper + Field、Batch 模块(TDD)

业务表(fields/batches)无 agentId 列,agent_admin 需按"属于本代理商的 merchant 列表"过滤 ownerId。先给 ScopeService 增加一个 helper,再建两个模块。

**Files:**
- Modify: `packages/backend/src/common/scope/scope.service.ts`, `scope.service.spec.ts`
- Create: `src/modules/field/field.service.ts`, `field.controller.ts`, `field.module.ts`
- Create: `src/modules/batch/batch.service.ts`, `batch.controller.ts`, `batch.module.ts`

- [ ] **Step 1: 给 ScopeService 加 helper 的失败测试** — 追加到 `scope.service.spec.ts`:
```typescript
describe('ScopeService.merchantIdsForAgent', () => {
  it('查询某 agent 下所有 merchant 的 id', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]) } } as any;
    const s = new ScopeService();
    const ids = await s.merchantIdsForAgent(prisma, 't1', 'a1');
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: 'merchant', agentId: 'a1' }, select: { id: true },
    });
    expect(ids).toEqual(['m1', 'm2']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @nongchang/backend exec vitest run src/common/scope/scope.service.spec.ts`
Expected: FAIL — merchantIdsForAgent 未定义。

- [ ] **Step 3: 实现 helper** — 在 `scope.service.ts` 的 ScopeService 类中追加方法:
```typescript
  async merchantIdsForAgent(prisma: any, tenantId: string, agentId: string): Promise<string[]> {
    const rows = await prisma.user.findMany({
      where: { tenantId, role: 'merchant', agentId }, select: { id: true },
    });
    return rows.map((r: { id: string }) => r.id);
  }

  /** 业务表(带 ownerId)的范围 where。agent_admin 需传入其旗下 merchant ids。 */
  async ownedScopeWhere(prisma: any, user: AuthUser): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (user.role === Role.MERCHANT && user.ownerId) where.ownerId = user.ownerId;
    if (user.role === Role.AGENT_ADMIN && user.agentId) {
      const ids = await this.merchantIdsForAgent(prisma, user.tenantId, user.agentId);
      where.ownerId = { in: ids };
    }
    return where;
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @nongchang/backend exec vitest run src/common/scope/scope.service.spec.ts`
Expected: PASS(全部用例)。
```bash
git add packages/backend/src/common/scope
git commit -m "feat(backend): add owner-scope helpers to ScopeService for agent-level filtering (tested)"
```

- [ ] **Step 5: FieldService** — `src/modules/field/field.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthUser, CreateFieldDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Injectable()
export class FieldService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateFieldDto) {
    const { lng, lat, ...rest } = dto;
    const field = await this.prisma.field.create({
      data: { tenantId: user.tenantId, name: rest.name, area: rest.area,
        ownerId: rest.ownerId, iotDeviceId: rest.iotDeviceId ?? null },
    });
    // 写入 PostGIS 地理列(Prisma 不支持 geography,用原生 SQL)
    await this.prisma.$executeRawUnsafe(
      `UPDATE fields SET location = ST_SetSRID(ST_MakePoint($1,$2),4326) WHERE id = $3`,
      lng, lat, field.id,
    );
    return field;
  }

  async list(user: AuthUser) {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    return this.prisma.field.findMany({ where });
  }
}
```

`src/modules/field/field.controller.ts`:
```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { createFieldSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { FieldService } from './field.service.js';

@Controller('fields')
export class FieldController {
  constructor(private svc: FieldService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createFieldSchema)) dto: any) {
    return this.svc.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: any) { return this.svc.list(user); }
}
```

`src/modules/field/field.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { FieldService } from './field.service.js';
import { FieldController } from './field.controller.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Module({ providers: [FieldService, ScopeService], controllers: [FieldController] })
export class FieldModule {}
```

- [ ] **Step 6: BatchService** — `src/modules/batch/batch.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthUser, CreateBatchDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Injectable()
export class BatchService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateBatchDto) {
    return this.prisma.batch.create({
      data: {
        tenantId: user.tenantId, ownerId: dto.ownerId, fieldId: dto.fieldId,
        batchNo: dto.batchNo, cropName: dto.cropName,
        plantDate: new Date(dto.plantDate), expectedHarvest: new Date(dto.expectedHarvest),
        status: dto.status,
      },
    });
  }

  async list(user: AuthUser) {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    return this.prisma.batch.findMany({ where });
  }
}
```

`src/modules/batch/batch.controller.ts`:
```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { createBatchSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BatchService } from './batch.service.js';

@Controller('batches')
export class BatchController {
  constructor(private svc: BatchService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createBatchSchema)) dto: any) {
    return this.svc.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: any) { return this.svc.list(user); }
}
```

`src/modules/batch/batch.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { BatchController } from './batch.controller.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Module({ providers: [BatchService, ScopeService], controllers: [BatchController] })
export class BatchModule {}
```

- [ ] **Step 7: 提交**
```bash
git add packages/backend/src/modules/field packages/backend/src/modules/batch
git commit -m "feat(backend): add field (PostGIS) and batch modules with scoped listing"
```

## Task 11: FarmRecord、Trace、User 模块

farm_records / trace_* 表无 ownerId 列,其范围需经 batch 关联。本任务用 `batch_id in (可见批次)` 的方式过滤。

**Files:**
- Create: `src/modules/farm-record/{farm-record.service.ts,farm-record.controller.ts,farm-record.module.ts}`
- Create: `src/modules/trace/{trace.service.ts,trace.controller.ts,trace.module.ts}`
- Create: `src/modules/user/{user.service.ts,user.controller.ts,user.module.ts}`

- [ ] **Step 1: FarmRecordService** — `src/modules/farm-record/farm-record.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthUser, CreateFarmRecordDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Injectable()
export class FarmRecordService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateFarmRecordDto) {
    return this.prisma.farmRecord.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, fieldId: dto.fieldId,
        operatorId: user.userId, action: dto.action,
        detail: dto.detail ?? undefined, images: dto.images ?? undefined,
        location: dto.location ?? null, recordedAt: new Date(dto.recordedAt), source: dto.source,
      },
    });
  }

  async list(user: AuthUser) {
    const batchWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where: batchWhere, select: { id: true } });
    return this.prisma.farmRecord.findMany({
      where: { tenantId: user.tenantId, batchId: { in: batches.map(b => b.id) } },
    });
  }
}
```

`src/modules/farm-record/farm-record.controller.ts`:
```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { createFarmRecordSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { FarmRecordService } from './farm-record.service.js';

@Controller('farm-records')
export class FarmRecordController {
  constructor(private svc: FarmRecordService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createFarmRecordSchema)) dto: any) {
    return this.svc.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: any) { return this.svc.list(user); }
}
```

`src/modules/farm-record/farm-record.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { FarmRecordService } from './farm-record.service.js';
import { FarmRecordController } from './farm-record.controller.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Module({ providers: [FarmRecordService, ScopeService], controllers: [FarmRecordController] })
export class FarmRecordModule {}
```

- [ ] **Step 2: TraceService** — `src/modules/trace/trace.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser, CreateTraceEventDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Injectable()
export class TraceService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  // 为批次生成溯源码(基础版,扫码展示逻辑留子项目 2)
  generateCode(user: AuthUser, batchId: string) {
    const code = `ORC-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.traceCode.create({
      data: { tenantId: user.tenantId, batchId, code },
    });
  }

  addEvent(user: AuthUser, dto: CreateTraceEventDto) {
    return this.prisma.traceEvent.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, type: dto.type, title: dto.title,
        actor: dto.actor, location: dto.location, occurredAt: new Date(dto.occurredAt),
        payload: dto.payload ?? undefined,
      },
    });
  }

  async listEvents(user: AuthUser, batchId: string) {
    return this.prisma.traceEvent.findMany({
      where: { tenantId: user.tenantId, batchId }, orderBy: { occurredAt: 'asc' },
    });
  }
}
```

`src/modules/trace/trace.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { createTraceEventSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TraceService } from './trace.service.js';

@Controller('trace')
export class TraceController {
  constructor(private svc: TraceService) {}

  @Post('codes/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  genCode(@CurrentUser() user: any, @Param('batchId') batchId: string) {
    return this.svc.generateCode(user, batchId);
  }

  @Post('events') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  addEvent(@CurrentUser() user: any, @Body(new ZodValidationPipe(createTraceEventSchema)) dto: any) {
    return this.svc.addEvent(user, dto);
  }

  @Get('events/:batchId')
  list(@CurrentUser() user: any, @Param('batchId') batchId: string) {
    return this.svc.listEvents(user, batchId);
  }
}
```

`src/modules/trace/trace.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TraceService } from './trace.service.js';
import { TraceController } from './trace.controller.js';
import { ScopeService } from '../../common/scope/scope.service.js';

@Module({ providers: [TraceService, ScopeService], controllers: [TraceController] })
export class TraceModule {}
```

- [ ] **Step 3: UserService(创建商家/农户)** — `src/modules/user/user.service.ts`:
```typescript
import { Injectable, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthUser, CreateUserDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    // agent_admin 只能在自己 agentId 下创建 merchant
    let agentId = dto.agentId ?? null;
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
      agentId = actor.agentId;
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId: actor.tenantId, role: dto.role, agentId,
        username: dto.username, passwordHash, phone: dto.phone ?? null,
        displayName: dto.displayName,
      },
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
  }

  list(actor: AuthUser) {
    const where: Record<string, string> = { tenantId: actor.tenantId };
    if (actor.role === Role.AGENT_ADMIN && actor.agentId) where.agentId = actor.agentId;
    return this.prisma.user.findMany({
      where, select: { id: true, username: true, role: true, agentId: true, displayName: true, status: true },
    });
  }
}
```

`src/modules/user/user.controller.ts`:
```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { createUserSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { UserService } from './user.service.js';

@Controller('users')
export class UserController {
  constructor(private svc: UserService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createUserSchema)) dto: any) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  list(@CurrentUser() user: any) { return this.svc.list(user); }
}
```

`src/modules/user/user.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';

@Module({ providers: [UserService], controllers: [UserController] })
export class UserModule {}
```

- [ ] **Step 4: 整体构建验证**

Run: `pnpm --filter @nongchang/backend build`
Expected: 全部模块编译通过(app.module.ts 的所有 import 现已存在)。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/src/modules/farm-record packages/backend/src/modules/trace packages/backend/src/modules/user
git commit -m "feat(backend): add farm-record, trace and user modules with scoped access"
```

## Task 12: 隔离 e2e 测试(真实数据库,关键安全验证)

验证横向越权被拦截。**不 mock 数据库**——用种子数据跑真实 PG。

**Files:**
- Create: `packages/backend/test/isolation.e2e-spec.ts`

- [ ] **Step 1: 前置准备**

确认本地测试库已迁移 + 种子(Task 3/4 已建)。e2e 直接打真实 Nest 应用。

- [ ] **Step 2: 写 e2e 测试** — `packages/backend/test/isolation.e2e-spec.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;

async function token(username: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ username, password: 'password123' });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('多租户/代理商数据隔离', () => {
  it('未带 token 访问受保护路由返回 401', async () => {
    await request(app.getHttpServer()).get('/api/agents/merchants').expect(401);
  });

  it('merchant 无权创建代理商(403)', async () => {
    const t = await token('merchantA');
    await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${t}`)
      .send({ name: 'x', region: 'y' }).expect(403);
  });

  it('agentA 只能看到自己旗下的 merchant,看不到 agentB 的', async () => {
    const t = await token('agentA');
    const res = await request(app.getHttpServer())
      .get('/api/agents/merchants').set('Authorization', `Bearer ${t}`).expect(200);
    const names = res.body.map((m: any) => m.displayName);
    expect(names).toContain('大理基地');     // agentA 旗下
    expect(names).not.toContain('上海基地'); // agentB 旗下,必须看不到
  });

  it('agentA 列出地块时看不到 agentB 旗下 merchant 的地块', async () => {
    const t = await token('agentA');
    const res = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${t}`).expect(200);
    const names = res.body.map((f: any) => f.name);
    expect(names).toContain('A区露地');
    expect(names).not.toContain('B区大棚');
  });

  it('system_admin 能看到全部 merchant', async () => {
    const t = await token('sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/agents/merchants').set('Authorization', `Bearer ${t}`).expect(200);
    const names = res.body.map((m: any) => m.displayName);
    expect(names).toContain('大理基地');
    expect(names).toContain('上海基地');
  });
});
```

- [ ] **Step 3: 运行 e2e**

Run: `pnpm --filter @nongchang/backend exec vitest run test/isolation.e2e-spec.ts`
Expected: PASS(5 用例)。若失败,说明隔离有漏洞,**必须修复后才算完成**(这是子项目核心验收点)。

- [ ] **Step 4: 全量测试**

Run: `pnpm --filter @nongchang/backend test`
Expected: 所有单元 + e2e 测试 PASS。

- [ ] **Step 5: 提交**
```bash
git add packages/backend/test
git commit -m "test(backend): add cross-agent/tenant isolation e2e tests"
```

---

## Task 13: 现有 Web 迁入 monorepo + 宝塔部署文档

**Files:**
- Move: 现有根目录 `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `metadata.json`, `assets/` → `packages/web/`
- Create: `packages/web/package.json`(由现有根 package.json 拆分前端部分)
- Create: `docs/deploy/baota.md`
- Delete: 根 `server.ts`, `fix.cjs`, `replace.cjs`(评估确认无用后)

- [ ] **Step 1: 物理迁移 web**

把现有前端文件移动到 `packages/web/`,新建 `packages/web/package.json`,把根 `package.json` 里 react/vite/tailwind 等前端依赖移入。**不改任何组件逻辑与 Mock 数据**(真实化留子项目 4)。

- [ ] **Step 2: 验证 web 可构建**

Run: `pnpm --filter web build`
Expected: Vite 构建产出 `packages/web/dist`,无报错。

- [ ] **Step 3: 清理旧后端文件**

旧根 `server.ts`(Express+Gemini)已被 backend 取代;`fix.cjs`/`replace.cjs` 为一次性脚本。确认无引用后删除。
Run: `git rm server.ts fix.cjs replace.cjs`

- [ ] **Step 4: 宝塔部署文档** — `docs/deploy/baota.md`,内容覆盖:

1. 宝塔软件商店安装 PostgreSQL,创建库 `nongchang` 与用户,启用 PostGIS 扩展。
2. Node 环境(宝塔 Node 版本管理器,Node 20+),全局装 pnpm。
3. 拉代码 → `pnpm install` → `pnpm build:shared` → `pnpm build:backend` → `pnpm --filter @nongchang/backend prisma:deploy`。
4. PM2 管理器添加项目:启动文件 `packages/backend/dist/main.js`,配置 `.env`(DATABASE_URL/JWT_SECRET 等),端口 3001。
5. Web:`pnpm --filter web build`,Nginx 站点根指向 `packages/web/dist`。
6. Nginx 反代配置:
   ```nginx
   location /api/ { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; }
   location / { try_files $uri $uri/ /index.html; }
   ```
7. 安全提醒:JWT_SECRET 用强随机值;PostgreSQL 不对公网开放;`.env` 不入库。

- [ ] **Step 5: 提交**
```bash
git add packages/web docs/deploy/baota.md
git rm --cached server.ts fix.cjs replace.cjs 2>/dev/null || true
git commit -m "chore: migrate web into monorepo, remove legacy server, add baota deploy guide"
```

---

## 完成验收标准

- `pnpm --filter @nongchang/backend test` 全绿(单元 + e2e)。
- e2e 隔离测试证明:agent_admin 看不到他人数据、merchant 看不到他人数据、未登录被 401、越权角色被 403。
- `pnpm build:shared && pnpm build:backend && pnpm --filter web build` 全部成功。
- 宝塔部署文档可照做落地。

后续子项目(2-5)在此地基上扩展,不在本计划范围。
