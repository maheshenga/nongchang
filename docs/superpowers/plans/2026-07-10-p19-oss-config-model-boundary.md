# P19 OSS Config Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic OSS configuration helpers from `OssConfigService` so secret masking handoff, upsert data, sparse secret updates, and enabled credential decisions are directly tested.

**Architecture:** `OssConfigService` remains responsible for Prisma reads/writes, encryption/decryption, and live OSS connectivity checks. A new `oss-config.model.ts` owns pure row projection, upsert argument construction, enabled-row decision logic, and decrypted credential projection with no database, network, or crypto side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` OSS DTO and response types.

## Global Constraints

- Do not change `OssConfigController` routes, DTO schemas, API response shape, Prisma query shape, `EncryptionService` usage, or `ali-oss` test behavior.
- Preserve `OssConfigView` shape: `region`, `bucket`, `accessKeyId`, `accessKeySecretMasked`, `baseUrl`, `enabled`.
- Preserve masking behavior: encrypted `accessKeySecEnc` is decrypted and masked by service before passing to model.
- Preserve first-time validation behavior in service: missing `accessKeySecret` throws `首次配置需提供 accessKeySecret`.
- Preserve enabled default: `dto.enabled ?? existing?.enabled ?? false`.
- Preserve upsert behavior: update always includes `region`, `bucket`, `accessKeyId`, `baseUrl`, and `enabled`; `accessKeySecEnc` is included in update only when a new secret value is provided.
- Preserve create behavior: `accessKeySecEnc` receives the encrypted secret string, or the existing service fallback empty string when no new secret value is present.
- Preserve credential behavior: credentials are returned only when row exists and `enabled` is true; decrypted `accessKeySecret` is supplied by service.
- Preserve test endpoint behavior: if credentials are missing, return `{ ok: false, error: '未配置或未启用 OSS' }`; provider/network failures return `{ ok: false, error: '连接失败' }`.

---

## File Structure

- Create `packages/backend/src/modules/oss-config/oss-config.model.ts`
  - Pure helpers for row projection, upsert args, and enabled credential decisions.
- Create `packages/backend/src/modules/oss-config/oss-config.model.spec.ts`
  - Direct helper tests for projection, sparse update behavior, and credential gating.
- Modify `packages/backend/src/modules/oss-config/oss-config.service.ts`
  - Replace inline pure logic with imports from `oss-config.model.ts`.

---

### Task 1: Add OSS Config Model Tests

**Files:**
- Create: `packages/backend/src/modules/oss-config/oss-config.model.spec.ts`

**Interfaces:**
- Future exports:
  - `OssConfigRow`
  - `OssCredentials`
  - `buildOssConfigView(input: { row: OssConfigRow; accessKeySecretMasked: string }): OssConfigView`
  - `buildOssUpsertArgs(input: { tenantId: string; region: string; bucket: string; accessKeyId: string; accessKeySecEnc: string; baseUrl: string | null; enabled: boolean })`
  - `canUseOssCredentials(row: OssConfigRow | null): row is OssConfigRow & { enabled: true }`
  - `buildOssCredentials(input: { row: OssConfigRow; accessKeySecret: string }): OssCredentials`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/oss-config/oss-config.model.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildOssConfigView,
  buildOssCredentials,
  buildOssUpsertArgs,
  canUseOssCredentials,
  type OssConfigRow,
} from './oss-config.model';

describe('oss config model helpers', () => {
  const baseRow: OssConfigRow = {
    id: 'oss1',
    tenantId: 't1',
    region: 'oss-cn-hangzhou',
    bucket: 'farm-bucket',
    accessKeyId: 'AKID',
    accessKeySecEnc: 'ENC(secret)',
    baseUrl: 'https://cdn.example.com',
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('projects OSS config views with masked secret supplied by service', () => {
    expect(buildOssConfigView({ row: baseRow, accessKeySecretMasked: '****1234' })).toEqual({
      region: 'oss-cn-hangzhou',
      bucket: 'farm-bucket',
      accessKeyId: 'AKID',
      accessKeySecretMasked: '****1234',
      baseUrl: 'https://cdn.example.com',
      enabled: true,
    });
  });

  it('normalizes missing baseUrl to null in views and credentials', () => {
    const row = { ...baseRow, baseUrl: null };

    expect(buildOssConfigView({ row, accessKeySecretMasked: '****1234' }).baseUrl).toBeNull();
    expect(buildOssCredentials({ row, accessKeySecret: 'plain-secret' }).baseUrl).toBeNull();
  });

  it('builds upsert args with sparse access key secret update', () => {
    expect(buildOssUpsertArgs({
      tenantId: 't1',
      region: 'oss-cn-hangzhou',
      bucket: 'farm-bucket',
      accessKeyId: 'AKID',
      accessKeySecEnc: 'ENC(secret)',
      baseUrl: 'https://cdn.example.com',
      enabled: true,
    })).toEqual({
      where: { tenantId: 't1' },
      create: {
        tenantId: 't1',
        region: 'oss-cn-hangzhou',
        bucket: 'farm-bucket',
        accessKeyId: 'AKID',
        accessKeySecEnc: 'ENC(secret)',
        baseUrl: 'https://cdn.example.com',
        enabled: true,
      },
      update: {
        region: 'oss-cn-hangzhou',
        bucket: 'farm-bucket',
        accessKeyId: 'AKID',
        baseUrl: 'https://cdn.example.com',
        enabled: true,
        accessKeySecEnc: 'ENC(secret)',
      },
    });

    expect(buildOssUpsertArgs({
      tenantId: 't1',
      region: 'oss-cn-shanghai',
      bucket: 'farm-bucket-2',
      accessKeyId: 'AKID2',
      accessKeySecEnc: '',
      baseUrl: null,
      enabled: false,
    })).toEqual({
      where: { tenantId: 't1' },
      create: {
        tenantId: 't1',
        region: 'oss-cn-shanghai',
        bucket: 'farm-bucket-2',
        accessKeyId: 'AKID2',
        accessKeySecEnc: '',
        baseUrl: null,
        enabled: false,
      },
      update: {
        region: 'oss-cn-shanghai',
        bucket: 'farm-bucket-2',
        accessKeyId: 'AKID2',
        baseUrl: null,
        enabled: false,
      },
    });
  });

  it('returns usable credentials only when row is enabled', () => {
    expect(canUseOssCredentials(null)).toBe(false);
    expect(canUseOssCredentials({ ...baseRow, enabled: false })).toBe(false);
    expect(canUseOssCredentials(baseRow)).toBe(true);

    expect(buildOssCredentials({ row: baseRow, accessKeySecret: 'plain-secret' })).toEqual({
      region: 'oss-cn-hangzhou',
      bucket: 'farm-bucket',
      accessKeyId: 'AKID',
      accessKeySecret: 'plain-secret',
      baseUrl: 'https://cdn.example.com',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/oss-config/oss-config.model.spec.ts
```

Expected: FAIL because `./oss-config.model` does not exist.

---

### Task 2: Implement OSS Config Model Helpers

**Files:**
- Create: `packages/backend/src/modules/oss-config/oss-config.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Create `packages/backend/src/modules/oss-config/oss-config.model.ts`:

```typescript
import type { OssConfigView } from '@nongchang/shared';

export interface OssConfigRow {
  id: string;
  tenantId: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecEnc: string;
  baseUrl: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OssCredentials {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  baseUrl: string | null;
}

export function buildOssConfigView(input: {
  row: OssConfigRow;
  accessKeySecretMasked: string;
}): OssConfigView {
  return {
    region: input.row.region,
    bucket: input.row.bucket,
    accessKeyId: input.row.accessKeyId,
    accessKeySecretMasked: input.accessKeySecretMasked,
    baseUrl: input.row.baseUrl ?? null,
    enabled: input.row.enabled,
  };
}

export function buildOssUpsertArgs(input: {
  tenantId: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecEnc: string;
  baseUrl: string | null;
  enabled: boolean;
}) {
  const update: Record<string, unknown> = {
    region: input.region,
    bucket: input.bucket,
    accessKeyId: input.accessKeyId,
    baseUrl: input.baseUrl,
    enabled: input.enabled,
  };
  if (input.accessKeySecEnc) update.accessKeySecEnc = input.accessKeySecEnc;

  return {
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      region: input.region,
      bucket: input.bucket,
      accessKeyId: input.accessKeyId,
      accessKeySecEnc: input.accessKeySecEnc,
      baseUrl: input.baseUrl,
      enabled: input.enabled,
    },
    update,
  };
}

export function canUseOssCredentials(row: OssConfigRow | null): row is OssConfigRow & { enabled: true } {
  return !!row?.enabled;
}

export function buildOssCredentials(input: {
  row: OssConfigRow;
  accessKeySecret: string;
}): OssCredentials {
  return {
    region: input.row.region,
    bucket: input.row.bucket,
    accessKeyId: input.row.accessKeyId,
    accessKeySecret: input.accessKeySecret,
    baseUrl: input.row.baseUrl ?? null,
  };
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/oss-config/oss-config.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire OssConfigService

**Files:**
- Modify: `packages/backend/src/modules/oss-config/oss-config.service.ts`

**Interfaces:**
- Consumes helpers from `./oss-config.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  buildOssConfigView,
  buildOssCredentials,
  buildOssUpsertArgs,
  canUseOssCredentials,
  type OssConfigRow,
  type OssCredentials,
} from './oss-config.model';
```

Replace:
- Local `OssConfigRow` interface with imported type.
- Local `OssCredentials` interface with imported exported type.
- `toView` implementation with `buildOssConfigView({ row: r, accessKeySecretMasked: this.enc.maskSecret(this.enc.decrypt(r.accessKeySecEnc)) })`.
- Inline `create` and `update` object construction in `upsert` with `buildOssUpsertArgs({ tenantId: user.tenantId, region: dto.region, bucket: dto.bucket, accessKeyId: dto.accessKeyId, accessKeySecEnc: secretEnc, baseUrl: dto.baseUrl ?? null, enabled })`.
- `getCredentials` enabled check with `canUseOssCredentials(row)`.
- `getCredentials` return object with `buildOssCredentials({ row, accessKeySecret: this.enc.decrypt(row.accessKeySecEnc) })`.

Keep:
- `BadRequestException('首次配置需提供 accessKeySecret')`.
- `secretEnc = dto.accessKeySecret ? this.enc.encrypt(dto.accessKeySecret) : ''`.
- `enabled = dto.enabled ?? existing?.enabled ?? false`.
- Prisma `findUnique`, `upsert`, and live OSS test logic.

- [ ] **Step 2: Run focused OSS tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/oss-config/oss-config.model.spec.ts src/modules/oss-config/oss-config.service.spec.ts src/modules/upload/oss.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run full verification**

Run serially:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- Build exits `0`.
- Backend unit tests exit `0`.
- `diff --check` exits `0`; LF-to-CRLF warnings are acceptable on Windows if there are no whitespace errors.

- [ ] **Step 2: Review scope**

Review P19 OSS config model boundary. Ensure no controller/DTO/query/crypto/network behavior changed. Verify view projection, masking handoff, sparse secret update behavior, enabled default, credential gating, and test endpoint failure copy match previous behavior.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p19-oss-config-model-boundary.md packages/backend/src/modules/oss-config/oss-config.model.ts packages/backend/src/modules/oss-config/oss-config.model.spec.ts packages/backend/src/modules/oss-config/oss-config.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract oss config model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers config view projection, sparse upsert data, enabled credential gating, decrypted credential projection, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
