# Full Bug Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复地块原子性、公开坐标隐私、扫码统计一致性、Web Dialog 并发、小程序请求竞态和 SaaS 硬编码文案，并通过完整生产验证门禁。

**Architecture:** 新建一对一 `TenantSettings` 作为租户展示与公开策略的唯一数据源，通过 Shared Zod 契约、受保护的 Backend API、Web Branding Context 和 Miniapp Branding Store 向各端投影。数据库一致性修复使用 Prisma 交互式事务；UI 并发问题使用小型可测试状态协调器解决。

**Tech Stack:** pnpm workspace、TypeScript 5.8、NestJS 11、Prisma 6/PostgreSQL/PostGIS、Zod 3、React 19/Vitest、Taro 4/React 18。

## Global Constraints

- 不使用 `using-superpowers`。
- 每项生产代码改动必须先有失败回归测试并确认 RED。
- `publicCoordinateMode` 仅允许 `hidden | approximate | exact`，数据库和 Shared 默认值都为 `hidden`。
- 模糊坐标统一在 Backend 保留小数点后两位；前端不得接触原始坐标后再脱敏。
- 不改变冻结码“暂停公开展示、内部仍可用于授权作业”的语义。
- 不修改显式隔离的 `packages/web/src/components/legacy/**` 和 `packages/web/src/components/dashboard-demo/**`。
- 新增配置接口必须经过现有 JWT、角色和租户边界；不存在匿名配置写接口。
- 配置读取失败不得阻断登录、农事记录、批次或溯源主流程。
- 不新增第三方依赖、消息队列或地图供应商。
- 完成声明前必须运行 `pnpm verify:production`；若环境阻塞，必须报告准确阻塞范围。

---

## File Responsibility Map

- `packages/shared/src/dto/tenant-settings.dto.ts`：坐标模式、租户展示配置输入/输出的运行时契约与默认值。
- `packages/backend/prisma/schema.prisma`、`packages/backend/prisma/migrations/20260720023000_tenant_settings/migration.sql`：`TenantSettings` 一对一持久化。编号紧随仓库现有最新迁移 `20260720021500_relax_batch_field_revision_drift`，避免向已经部署的迁移历史倒序插入。
- `packages/backend/src/modules/tenant-settings/*`：配置默认值、读取、更新、权限和缓存失效。
- `packages/backend/src/modules/field/*`：原子创建地块并返回最终 `FieldView`。
- `packages/backend/src/modules/public-trace/*`：公共隐私投影和扫码事务一致性。
- `packages/web/src/branding/*`：Web 配置加载、通用回退和 Context。
- `packages/miniapp/src/store/branding.ts`：小程序配置缓存、通用回退和动态标题。
- `packages/miniapp/src/utils/latest-request.ts`：只接收最新请求结果的纯协调器。
- `packages/web/src/hooks/useDialog.tsx`：全局 FIFO Dialog 队列。

---

### Task 1: 建立租户设置 Shared 契约和数据库模型

**Files:**
- Create: `packages/shared/src/dto/tenant-settings.dto.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/dto/tenant-settings.dto.spec.ts`
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260720023000_tenant_settings/migration.sql`

**Interfaces:**
- Produces: `PublicCoordinateMode`
- Produces: `TenantSettingsView`
- Produces: `UpdateTenantSettingsInput`
- Produces: `DEFAULT_TENANT_SETTINGS`
- Produces Prisma model `TenantSettings` with unique `tenantId`

- [ ] **Step 1: Write the failing Shared contract tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TENANT_SETTINGS,
  publicCoordinateModeSchema,
  tenantSettingsViewSchema,
  updateTenantSettingsSchema,
} from './tenant-settings.dto';

describe('tenant settings contract', () => {
  it('defaults public coordinates to hidden and copy to generic agriculture terms', () => {
    expect(DEFAULT_TENANT_SETTINGS).toEqual({
      publicCoordinateMode: 'hidden',
      brandName: '农场溯源管理',
      industryName: '农业',
      defaultCropName: '作物',
      workbenchTitle: '农业工作台',
      defaultBaseLabel: '当前基地',
    });
  });

  it('accepts only supported coordinate modes', () => {
    expect(publicCoordinateModeSchema.parse('approximate')).toBe('approximate');
    expect(() => publicCoordinateModeSchema.parse('public')).toThrow();
  });

  it('trims copy and rejects unknown fields', () => {
    expect(updateTenantSettingsSchema.parse({
      brandName: '  云岭农场  ',
      publicCoordinateMode: 'exact',
    })).toEqual({
      brandName: '云岭农场',
      publicCoordinateMode: 'exact',
    });
    expect(() => updateTenantSettingsSchema.parse({ injected: '<script>' })).toThrow();
  });

  it('requires a complete view from the backend', () => {
    expect(tenantSettingsViewSchema.parse(DEFAULT_TENANT_SETTINGS)).toEqual(DEFAULT_TENANT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run the Shared test and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/shared test -- tenant-settings.dto.spec.ts
```

Expected: FAIL because `tenant-settings.dto.ts` and its exports do not exist.

- [ ] **Step 3: Implement the Shared schemas and exports**

Create schemas with these exact limits:

```typescript
export const publicCoordinateModeSchema = z.enum(['hidden', 'approximate', 'exact']);
const copySchema = z.string().trim().min(1).max(64);

export const DEFAULT_TENANT_SETTINGS = {
  publicCoordinateMode: 'hidden',
  brandName: '农场溯源管理',
  industryName: '农业',
  defaultCropName: '作物',
  workbenchTitle: '农业工作台',
  defaultBaseLabel: '当前基地',
} as const;

export const tenantSettingsViewSchema = z.object({
  publicCoordinateMode: publicCoordinateModeSchema,
  brandName: copySchema,
  industryName: copySchema,
  defaultCropName: copySchema,
  workbenchTitle: copySchema,
  defaultBaseLabel: copySchema,
}).strict();

export const updateTenantSettingsSchema = tenantSettingsViewSchema.partial().strict();
```

Export inferred types and re-export the file from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run the Shared test and confirm GREEN**

Run:

```powershell
pnpm --filter @nongchang/shared test -- tenant-settings.dto.spec.ts
```

Expected: PASS for all four contract cases.

- [ ] **Step 5: Add the Prisma model and SQL migration**

Add to `Tenant`:

```prisma
settings TenantSettings?
```

Add:

```prisma
model TenantSettings {
  id                   String   @id @default(uuid())
  tenantId             String   @unique @map("tenant_id")
  publicCoordinateMode String   @default("hidden") @map("public_coordinate_mode")
  brandName            String   @default("农场溯源管理") @map("brand_name")
  industryName         String   @default("农业") @map("industry_name")
  defaultCropName      String   @default("作物") @map("default_crop_name")
  workbenchTitle       String   @default("农业工作台") @map("workbench_title")
  defaultBaseLabel     String   @default("当前基地") @map("default_base_label")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")
  tenant               Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_settings")
}
```

The SQL migration must create the table, defaults, unique index and cascading foreign key without inserting per-tenant rows; missing rows are resolved through application defaults.

- [ ] **Step 6: Validate Prisma schema and migration**

Run:

```powershell
pnpm --filter @nongchang/backend prisma:generate
pnpm exec prisma validate --schema packages/backend/prisma/schema.prisma
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/shared/src/dto/tenant-settings.dto.ts packages/shared/src/dto/tenant-settings.dto.spec.ts packages/shared/src/index.ts packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260720023000_tenant_settings/migration.sql
git commit -m "feat(settings): add tenant display policy contract"
```

---

### Task 2: 实现租户设置 Backend API 和缓存失效

**Files:**
- Create: `packages/backend/src/modules/tenant-settings/tenant-settings.model.ts`
- Create: `packages/backend/src/modules/tenant-settings/tenant-settings.model.spec.ts`
- Create: `packages/backend/src/modules/tenant-settings/tenant-settings.service.ts`
- Create: `packages/backend/src/modules/tenant-settings/tenant-settings.service.spec.ts`
- Create: `packages/backend/src/modules/tenant-settings/tenant-settings.controller.ts`
- Create: `packages/backend/src/modules/tenant-settings/tenant-settings.module.ts`
- Modify: `packages/backend/src/app.module.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.module.ts`

**Interfaces:**
- Consumes: `DEFAULT_TENANT_SETTINGS`, `TenantSettingsView`, `UpdateTenantSettingsInput`
- Produces: `GET /api/tenant-settings`
- Produces: `PUT /api/tenant-settings`
- Produces: `TenantSettingsService.getByTenantId(tenantId: string)`

- [ ] **Step 1: Write failing model and service tests**

Cover:

```typescript
it('uses tenant name as brandName when no settings row exists', async () => {
  prisma.tenantSettings.findUnique.mockResolvedValue(null);
  prisma.tenant.findUnique.mockResolvedValue({ name: '云岭农业' });
  await expect(service.getByTenantId('t1')).resolves.toMatchObject({
    brandName: '云岭农业',
    publicCoordinateMode: 'hidden',
    defaultCropName: '作物',
  });
});

it('upserts only the current tenant and invalidates its public trace cache', async () => {
  prisma.tenantSettings.upsert.mockResolvedValue(fullRow);
  await service.update(systemAdmin, { defaultCropName: '葡萄' });
  expect(prisma.tenantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { tenantId: 't1' },
  }));
  expect(cache.invalidateTenant).toHaveBeenCalledWith('t1');
});

it('rejects writes from non-system administrators', async () => {
  await expect(service.update(merchant, { defaultCropName: '葡萄' })).rejects.toThrow();
});
```

Also test `toTenantSettingsView()` fills every missing database field from `DEFAULT_TENANT_SETTINGS`.

- [ ] **Step 2: Run Backend tests and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/backend test:unit -- tenant-settings
```

Expected: FAIL because the module and service do not exist.

- [ ] **Step 3: Implement model, service, controller and module**

Use:

```typescript
@Controller('tenant-settings')
export class TenantSettingsController {
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.getByTenantId(user.tenantId);
  }

  @Put()
  @Roles(Role.SYSTEM_ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) dto: UpdateTenantSettingsInput,
  ) {
    return this.service.update(user, dto);
  }
}
```

`getByTenantId()` must query `tenantSettings` and tenant name in a bounded way. `update()` must upsert by `tenantId`, return the normalized view, and call `PublicTraceCacheService.invalidateTenant()` only after a successful database write.

Export `TenantSettingsService` from its module and import `PublicTraceModule`; import `TenantSettingsModule` in `AppModule`.

- [ ] **Step 4: Run Backend tests and confirm GREEN**

Run:

```powershell
pnpm --filter @nongchang/backend test:unit -- tenant-settings
```

Expected: all tenant-settings tests PASS.

- [ ] **Step 5: Add a controller authorization regression test**

Verify metadata or an HTTP E2E case proves:

- authenticated users can `GET`;
- only `system_admin` can `PUT`;
- a tenant cannot provide another tenant ID in path or body.

- [ ] **Step 6: Run controller test**

Run:

```powershell
pnpm --filter @nongchang/backend test:unit -- tenant-settings.controller
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/backend/src/modules/tenant-settings packages/backend/src/app.module.ts packages/backend/src/modules/public-trace/public-trace.module.ts
git commit -m "feat(settings): expose tenant display policy"
```

---

### Task 3: 事务化地块创建并返回最终坐标

**Files:**
- Modify: `packages/backend/src/modules/field/field.service.ts`
- Modify: `packages/backend/src/modules/field/field.model.ts`
- Modify: `packages/backend/src/modules/field/field.service.spec.ts`
- Modify: `packages/web/src/api/fields.spec.ts`

**Interfaces:**
- Produces: `FieldService.create(): Promise<FieldView>`
- Produces: a shared field serializer used by both create and list enrichment

- [ ] **Step 1: Add failing rollback and response tests**

Add tests that use a transaction harness:

```typescript
it('rolls back the field when coordinate persistence fails', async () => {
  tx.field.create.mockResolvedValue(created);
  tx.$executeRawUnsafe.mockRejectedValue(new Error('postgis unavailable'));
  await expect(service.create(merchant, dto)).rejects.toThrow('postgis unavailable');
  expect(transactionCommitted).toBe(false);
  expect(cache.invalidateTenant).not.toHaveBeenCalled();
});

it('returns the final field view with persisted coordinates', async () => {
  tx.$queryRawUnsafe.mockResolvedValue([{ id: 'f1', lng: 100, lat: 25 }]);
  await expect(service.create(merchant, dto)).resolves.toMatchObject({
    id: 'f1',
    lng: 100,
    lat: 25,
  });
});
```

Change the Web API test expectation from `lng: null, lat: null` to the actual coordinates returned by Backend.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/backend test:unit -- field.service.spec.ts
pnpm --filter web test -- fields.spec.ts
```

Expected: Backend rollback/final-view tests FAIL under the two-step implementation; Web expectation FAILS until the response contract is updated.

- [ ] **Step 3: Implement the interactive transaction**

Use:

```typescript
const view = await this.prisma.$transaction(async (tx) => {
  const field = await tx.field.create({ data });
  await tx.$executeRawUnsafe(
    'UPDATE fields SET location = ST_SetSRID(ST_MakePoint($1,$2),4326) WHERE id = $3',
    lng, lat, field.id,
  );
  const [coordinate] = await tx.$queryRawUnsafe<FieldCoordinateRow[]>(
    'SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id = $1::uuid',
    field.id,
  );
  return buildFieldView(field, ownerName, coordinate);
});
await this.cache?.invalidateTenant(user.tenantId);
return view;
```

Do not invalidate cache in `finally`. Reuse a model helper so list and create cannot drift in serialization.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the two commands from Step 2.

Expected: both exit 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add packages/backend/src/modules/field packages/web/src/api/fields.spec.ts
git commit -m "fix(fields): create coordinates atomically"
```

---

### Task 4: 对公开溯源坐标执行租户隐私投影

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace.model.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.model.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.module.ts`
- Modify: `packages/web/src/components/TraceabilityPage.spec.tsx`

**Interfaces:**
- Consumes: `TenantSettingsService.getByTenantId()`
- Produces: `projectPublicCoordinates(mode, lng, lat)`

- [ ] **Step 1: Write failing coordinate projection tests**

```typescript
expect(projectPublicCoordinates('hidden', 100.123456, 25.987654))
  .toEqual({ fieldLng: null, fieldLat: null });
expect(projectPublicCoordinates('approximate', 100.126, 25.984))
  .toEqual({ fieldLng: 100.13, fieldLat: 25.98 });
expect(projectPublicCoordinates('exact', 100.123456, 25.987654))
  .toEqual({ fieldLng: 100.123456, fieldLat: 25.987654 });
```

Service tests must assert hidden mode does not query `integrationConfig` and returns `tiandituKey: null`.

- [ ] **Step 2: Run public trace tests and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/backend test:unit -- public-trace.model.spec.ts public-trace.service.spec.ts
```

Expected: FAIL because coordinate projection and settings lookup do not exist.

- [ ] **Step 3: Implement privacy projection before response construction**

Load tenant settings alongside the field data. Apply the projection before calling `buildPublicTraceResponse()`. Query the Tianditu config only when projected coordinates are non-null. Do not include raw coordinates in response objects, cache entries, logs or event payload.

- [ ] **Step 4: Run Backend public trace tests and confirm GREEN**

Run the command from Step 2.

Expected: PASS for hidden, approximate and exact modes.

- [ ] **Step 5: Add Web map visibility regression cases**

Test:

```typescript
it('does not render the origin map when coordinates are hidden', async () => {
  traceMocks.fetchPublicTrace.mockResolvedValue({
    ...publicTrace,
    batch: { ...publicTrace.batch, fieldLng: null, fieldLat: null },
    tiandituKey: null,
  });
  render(<TraceabilityPage code="TRACE-HIDDEN" />);
  expect(await screen.findByText('官方溯源记录')).toBeTruthy();
  expect(screen.queryByText('Origin map')).toBeNull();
});
```

- [ ] **Step 6: Run Web trace test**

Run:

```powershell
pnpm --filter web test -- TraceabilityPage.spec.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add packages/backend/src/modules/public-trace packages/web/src/components/TraceabilityPage.spec.tsx
git commit -m "fix(trace): protect public field coordinates"
```

---

### Task 5: 事务化扫码计数和防伪明细

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`
- Modify: `packages/backend/test/public-trace.e2e-spec.ts`

**Interfaces:**
- Produces: `recordPublicScan(traceCode, meta): Promise<number>`

- [ ] **Step 1: Write failing transaction consistency tests**

Add:

```typescript
it('does not increment scanCount when traceScan creation fails', async () => {
  tx.traceScan.create.mockRejectedValue(new Error('scan insert failed'));
  await expect(service.getByCode('ORC-X', meta)).rejects.toThrow();
  expect(tx.traceCode.update).not.toHaveBeenCalled();
});

it('rolls back traceScan when scanCount update fails', async () => {
  tx.traceScan.create.mockResolvedValue(scan);
  tx.traceCode.update.mockRejectedValue(new Error('count update failed'));
  await expect(service.getByCode('ORC-X', meta)).rejects.toThrow();
  expect(transactionCommitted).toBe(false);
});
```

Keep a frozen-code case proving no transaction starts.

- [ ] **Step 2: Run public trace service tests and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/backend test:unit -- public-trace.service.spec.ts
```

Expected: the failure-swallowing implementation makes at least the first case FAIL.

- [ ] **Step 3: Implement `recordPublicScan`**

For requests with metadata:

```typescript
return this.prisma.$transaction(async (tx) => {
  await tx.traceScan.create({ data: scanData });
  const updated = await tx.traceCode.update({
    where: { code },
    data: { scanCount: { increment: 1 } },
    select: { scanCount: true },
  });
  return updated.scanCount;
});
```

Without metadata, perform the atomic `traceCode.update()` and return its count. Remove the empty `catch`.

- [ ] **Step 4: Run unit test and confirm GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Extend public trace E2E assertions**

Read count and detail totals before and after one successful public request, then assert both increase by one. Keep the fixture code unique to avoid anti-fake suite interference.

- [ ] **Step 6: Run focused E2E if database is available**

Run:

```powershell
pnpm --filter @nongchang/backend e2e:check-db
pnpm --filter @nongchang/backend test:e2e -- public-trace.e2e-spec.ts
```

Expected: both exit 0. If the DB precheck fails, record this as an environment blocker and continue with unit/build gates.

- [ ] **Step 7: Commit Task 5**

```powershell
git add packages/backend/src/modules/public-trace/public-trace.service.ts packages/backend/src/modules/public-trace/public-trace.service.spec.ts packages/backend/test/public-trace.e2e-spec.ts
git commit -m "fix(trace): keep scan totals and details atomic"
```

---

### Task 6: 将 Web Dialog 改为 FIFO 队列

**Files:**
- Modify: `packages/web/src/hooks/useDialog.tsx`
- Modify: `packages/web/src/hooks/useDialog.spec.tsx`

**Interfaces:**
- Keeps: `confirmDialog(options): Promise<boolean>`
- Keeps: `alertDialog(options): Promise<void>`
- Produces internal functions `enqueueDialog`, `settleCurrentDialog`, `cancelAllDialogs`

- [ ] **Step 1: Write failing FIFO tests**

Add:

```typescript
it('presents concurrent confirmations in FIFO order', async () => {
  render(<DialogHost />);
  const results: boolean[] = [];
  void confirmDialog({ title: 'First', message: 'one' }).then(v => results.push(v));
  void confirmDialog({ title: 'Second', message: 'two' }).then(v => results.push(v));

  expect(await screen.findByRole('dialog', { name: 'First' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '确认' }));
  expect(await screen.findByRole('dialog', { name: 'Second' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(results).toEqual([true, false]));
});

it('resolves current and queued requests when the last host unmounts', async () => {
  const view = render(<DialogHost />);
  const confirmResult = confirmDialog('one');
  const alertResult = alertDialog('two');
  view.unmount();
  await expect(confirmResult).resolves.toBe(false);
  await expect(alertResult).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run Dialog tests and confirm RED**

Run:

```powershell
pnpm --filter web test -- useDialog.spec.tsx
```

Expected: FIFO and queued-unmount tests FAIL because the second request overwrites the first.

- [ ] **Step 3: Implement current-plus-queue state**

Use one `currentDialog`, one `DialogRequest[]`, and one publish function. `enqueueDialog` activates immediately only when no request is active. Settling removes the active item, resolves it once, then publishes the next queued request. Last listener cleanup calls `cancelAllDialogs()` and resolves every request.

- [ ] **Step 4: Run Dialog tests and confirm GREEN**

Run the command from Step 2.

Expected: all Dialog and native-dialog-usage tests PASS.

- [ ] **Step 5: Commit Task 6**

```powershell
git add packages/web/src/hooks/useDialog.tsx packages/web/src/hooks/useDialog.spec.tsx
git commit -m "fix(web): queue concurrent dialogs"
```

---

### Task 7: 防止小程序溯源乱序响应覆盖当前批次

**Files:**
- Create: `packages/miniapp/src/utils/latest-request.ts`
- Create: `packages/miniapp/src/utils/latest-request.spec.ts`
- Modify: `packages/miniapp/src/pages/trace/index.tsx`
- Create: `packages/miniapp/src/pages/trace/index.spec.tsx`

**Interfaces:**
- Produces: `createLatestRequestGate()`
- Produces methods `begin(): number`, `isLatest(id: number): boolean`, `dispose(): void`

- [ ] **Step 1: Write failing request gate and page race tests**

Pure utility test:

```typescript
const gate = createLatestRequestGate();
const first = gate.begin();
const second = gate.begin();
expect(gate.isLatest(first)).toBe(false);
expect(gate.isLatest(second)).toBe(true);
gate.dispose();
expect(gate.isLatest(second)).toBe(false);
```

Page test must create deferred A/B promises, select A then B, resolve B first and A last, and assert the rendered event remains B.

- [ ] **Step 2: Run miniapp tests and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/miniapp test -- latest-request.spec.ts index.spec.tsx
```

Expected: missing utility and stale-response page assertion FAIL.

- [ ] **Step 3: Implement the gate and integrate it**

Store the gate in a `useRef`. Every `loadEvents()` calls `begin()`. Check `isLatest(requestId)` before `setEvents`, `setErr`, and `setLoading(false)`. Dispose in an unmount effect.

- [ ] **Step 4: Run miniapp tests and confirm GREEN**

Run the command from Step 2.

Expected: PASS, including A-failure/B-success and loading-state cases.

- [ ] **Step 5: Commit Task 7**

```powershell
git add packages/miniapp/src/utils/latest-request.ts packages/miniapp/src/utils/latest-request.spec.ts packages/miniapp/src/pages/trace/index.tsx packages/miniapp/src/pages/trace/index.spec.tsx
git commit -m "fix(miniapp): ignore stale trace responses"
```

---

### Task 8: 接入 Web SaaS 品牌配置

**Files:**
- Create: `packages/web/src/api/tenant-settings.ts`
- Create: `packages/web/src/api/tenant-settings.spec.ts`
- Create: `packages/web/src/branding/branding-context.tsx`
- Create: `packages/web/src/branding/branding-context.spec.tsx`
- Modify: `packages/web/src/main.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/components/Settings.tsx`
- Create: `packages/web/src/components/Settings.spec.tsx`
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
- Modify: relevant MerchantAdmin tests

**Interfaces:**
- Consumes: `GET/PUT /tenant-settings`
- Produces: `useBranding(): TenantSettingsView`
- Changes: `getNavItems(role, branding)`

- [ ] **Step 1: Write failing API and fallback tests**

Test runtime parsing and generic fallback:

```typescript
tenantSettingsApiMock.get.mockRejectedValue(new Error('offline'));
render(<BrandingProvider><Probe /></BrandingProvider>);
expect(await screen.findByText('农业工作台')).toBeTruthy();
```

Test successful config renders `云岭农业`, `葡萄档案`, and no `芍药`.

- [ ] **Step 2: Run branding tests and confirm RED**

Run:

```powershell
pnpm --filter web test -- tenant-settings.spec.ts branding-context.spec.tsx navigation.spec.ts
```

Expected: FAIL because API, provider and dynamic navigation do not exist.

- [ ] **Step 3: Implement API, provider and dynamic navigation**

`BrandingProvider` loads only when authenticated, resets to defaults on identity change/logout, and exposes a `reload()` method after settings save. `getNavItems()` must clone role navigation data and replace only the merchant archive label with `我的${defaultCropName}档案`.

Use `brandName` for desktop/mobile shell title in `App.tsx`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Add tenant settings form to Settings**

Keep existing local preferences section. For `system_admin`, add a separate “租户展示与公开策略” form with the six settings fields and a select for coordinate mode. On save:

- preserve typed values during request;
- show the backend error on failure;
- update Branding Context on success;
- describe `hidden`, `approximate`, and `exact` privacy consequences.

- [ ] **Step 6: Add Settings tests and confirm RED then GREEN**

Run before implementation to see missing form assertions fail, then after implementation:

```powershell
pnpm --filter web test -- Settings.spec.tsx
```

Expected final result: PASS for load, save, failure preservation and role visibility.

- [ ] **Step 7: Replace production merchant copy**

In `MerchantAdmin`, derive:

- search placeholder: `搜索批次或${defaultCropName}品种...`;
- create label: `新增${defaultCropName}生产批次`;
- table header: `${defaultCropName}品种/名称`.

Do not change demo or legacy files.

- [ ] **Step 8: Run MerchantAdmin tests**

Run:

```powershell
pnpm --filter web test -- MerchantAdmin
```

Expected: PASS with a non-peony configuration and existing trace-code behavior.

- [ ] **Step 9: Commit Task 8**

```powershell
git add packages/web/src/api/tenant-settings* packages/web/src/branding packages/web/src/main.tsx packages/web/src/App.tsx packages/web/src/navigation* packages/web/src/components/Settings* packages/web/src/components/MerchantAdmin*
git commit -m "feat(web): drive production copy from tenant settings"
```

---

### Task 9: 接入小程序 SaaS 品牌配置

**Files:**
- Create: `packages/miniapp/src/api/tenant-settings.ts`
- Create: `packages/miniapp/src/api/tenant-settings.spec.ts`
- Create: `packages/miniapp/src/store/branding.ts`
- Create: `packages/miniapp/src/store/branding.spec.ts`
- Modify: `packages/miniapp/src/app.config.ts`
- Modify: `packages/miniapp/src/pages/work/index.tsx`
- Modify: `packages/miniapp/src/pages/trace/index.tsx`
- Modify: corresponding page tests

**Interfaces:**
- Consumes: `GET /tenant-settings`
- Produces: `loadTenantBranding()`
- Produces: `getTenantBranding()`

- [ ] **Step 1: Write failing store and API tests**

Test:

- successful response is parsed and cached;
- failed response yields `DEFAULT_TENANT_SETTINGS`;
- switching authenticated tenant clears old cached branding;
- `Taro.setNavigationBarTitle({ title: workbenchTitle })` is called.

- [ ] **Step 2: Run focused miniapp tests and confirm RED**

Run:

```powershell
pnpm --filter @nongchang/miniapp test -- tenant-settings.spec.ts branding.spec.ts
```

Expected: FAIL because the API/store do not exist.

- [ ] **Step 3: Implement the miniapp API and branding store**

Use the existing authenticated `request()` helper and Shared schema. Store values in memory plus tenant-keyed Taro storage. Return generic defaults on network or schema failure.

- [ ] **Step 4: Run store tests and confirm GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Replace production hardcoded copy**

Change compile-time app title to `农业工作台`. At page display:

- Work title uses `workbenchTitle`.
- Work empty fallback uses `${defaultBaseLabel} · ${defaultCropName}种植组`.
- Trace poster uses `${defaultCropName}溯源记录`.
- Both pages call `setNavigationBarTitle()` with tenant-aware titles.

- [ ] **Step 6: Run page tests RED then GREEN**

Run:

```powershell
pnpm --filter @nongchang/miniapp test -- pages/work pages/trace
```

Expected final result: PASS and no production assertion contains `芍药`, `白芍` or `基地 A区`.

- [ ] **Step 7: Commit Task 9**

```powershell
git add packages/miniapp/src/api/tenant-settings* packages/miniapp/src/store/branding* packages/miniapp/src/app.config.ts packages/miniapp/src/pages/work packages/miniapp/src/pages/trace
git commit -m "feat(miniapp): apply tenant branding at runtime"
```

---

### Task 10: 完成契约、迁移和全量生产验证

**Files:**
- Modify only if verification reveals scoped defects in files changed by Tasks 1–9.
- Update: `docs/superpowers/plans/2026-07-19-full-bug-hardening.md` checkboxes during execution.

**Interfaces:**
- Verifies all deliverables; produces no new product behavior.

- [ ] **Step 1: Scan production sources for forbidden hardcoded copy**

Run:

```powershell
rg -n --glob '!**/*.spec.*' --glob '!**/legacy/**' --glob '!**/dashboard-demo/**' "芍药|白芍|基地 A区" packages/web/src packages/miniapp/src
```

Expected: no production UI hits. Agriculture-specific examples may remain only where a test or explicitly approved generic input hint requires them; otherwise replace with configured copy.

- [ ] **Step 2: Run migration and schema checks**

Run:

```powershell
pnpm --filter @nongchang/backend prisma:generate
pnpm exec prisma validate --schema packages/backend/prisma/schema.prisma
node scripts/release/migration-preflight.mjs
```

Expected: exit 0 for all commands.

- [ ] **Step 3: Run focused package tests**

Run:

```powershell
pnpm --filter @nongchang/shared test
pnpm --filter @nongchang/backend test:unit
pnpm --filter web test
pnpm --filter @nongchang/miniapp test
```

Expected: zero failed tests.

- [ ] **Step 4: Run type, lint and build gates**

Run:

```powershell
pnpm build:shared
pnpm build:backend
pnpm typecheck:web
pnpm lint
pnpm build:web
pnpm build:miniapp
```

Expected: every command exits 0.

- [ ] **Step 5: Run full production verification**

Run:

```powershell
pnpm verify:production
```

Expected: Shared, Backend, Web, Miniapp and Backend E2E suites pass; both frontend builds succeed; audit remains within the repository advisory budget.

- [ ] **Step 6: Review the complete diff against the approved spec**

Check:

```powershell
git diff bc90749...HEAD --check
git diff bc90749...HEAD --stat
git status --short
```

Verify every requirement in `docs/superpowers/specs/2026-07-19-full-bug-hardening-design.md` maps to a passing test and no unrelated files changed.

- [ ] **Step 7: Request code review and resolve findings**

Provide the reviewer:

- Base SHA: `bc90749`
- Head SHA: current `HEAD`
- Requirements: the approved design spec and this plan
- Focus: transaction boundaries, tenant isolation, public privacy, async cleanup and migration defaults

Fix all Critical and Important findings with new failing tests before implementation changes, then rerun affected focused tests and `pnpm verify:production`.

- [ ] **Step 8: Commit final verification-only adjustments**

If review or verification required changes:

```powershell
git add packages/shared packages/backend packages/web packages/miniapp docs/superpowers/plans/2026-07-19-full-bug-hardening.md
git commit -m "fix: address full hardening review"
```

If there are no changes, do not create an empty commit.

---

## Completion Checklist

- [ ] 地块坐标写入失败会完整回滚。
- [ ] 创建地块响应含最终 `lng/lat`。
- [ ] 公共坐标默认隐藏，模糊和精确模式有测试。
- [ ] 配置更新立即失效公开缓存。
- [ ] 扫码计数和明细在同一事务内。
- [ ] Dialog 并发请求严格 FIFO，卸载无悬挂 Promise。
- [ ] 小程序旧请求不能覆盖新批次状态。
- [ ] Web 和小程序生产文案来自租户配置。
- [ ] 非芍药租户不显示芍药专用生产文案。
- [ ] Prisma、单元测试、构建、lint、audit 和 E2E 均有本轮新鲜证据。
