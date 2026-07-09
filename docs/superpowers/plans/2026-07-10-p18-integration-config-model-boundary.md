# P18 Integration Config Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic integration configuration helpers from `IntegrationConfigService` so masking, upsert data, public key exposure decisions, WeChat tenant lookup decisions, and Xfyun credential decisions are directly tested.

**Architecture:** `IntegrationConfigService` remains responsible for Prisma reads/writes and encryption/decryption. A new `integration-config.model.ts` owns pure row projection, upsert argument construction, and enabled-row decision logic with no database or crypto side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` integration DTO and response types.

## Global Constraints

- Do not change integration controller routes, DTO schemas, API response shape, Prisma query shape, or encryption service usage.
- Preserve providers exactly: `wechat`, `xfyun`, `tianditu`.
- Preserve `IntegrationConfigView` shape: `provider`, `appId`, `secretMasked`, `apiKeyMasked`, `apiSecretMasked`, `enabled`.
- Preserve masking behavior: encrypted values are decrypted by service and masked before passing to model; missing encrypted values project as `null`.
- Preserve first-time validation behavior in service: WeChat missing `secret` throws `首次配置需提供微信 Secret`; Xfyun missing `apiKey` or `apiSecret` throws `首次配置需提供讯飞 APIKey 与 APISecret`.
- Preserve enabled defaults: WeChat/Xfyun use `dto.enabled ?? existing?.enabled ?? false`; Tianditu uses `dto.enabled ?? false`.
- Preserve upsert behavior: update always includes `{ appId, enabled }`; encrypted fields are included in update only when a new secret/key value is provided.
- Preserve Tianditu behavior: `dto.key` is stored in `appId` plaintext and returned only when row exists, enabled is true, and `appId` is present.
- Preserve WeChat tenant lookup behavior: row must exist, be enabled, and have `secretEnc`; returned value is `{ tenantId, secret: decryptedSecret }`.
- Preserve Xfyun credential behavior: row must exist, be enabled, and have `appId`, `apiKeyEnc`, and `apiSecretEnc`; returned value is decrypted `{ appId, apiKey, apiSecret }`.

---

## File Structure

- Create `packages/backend/src/modules/integration/integration-config.model.ts`
  - Pure helpers for row projection, upsert args, and enabled credential decisions.
- Create `packages/backend/src/modules/integration/integration-config.model.spec.ts`
  - Direct helper tests for projection, upsert data, and enabled credential decisions.
- Modify `packages/backend/src/modules/integration/integration-config.service.ts`
  - Replace inline pure logic with imports from `integration-config.model.ts`.

---

### Task 1: Add Integration Config Model Tests

**Files:**
- Create: `packages/backend/src/modules/integration/integration-config.model.spec.ts`

**Interfaces:**
- Future exports:
  - `IntegrationRow`
  - `buildIntegrationConfigView(input: { row: IntegrationRow; secretMasked: string | null; apiKeyMasked: string | null; apiSecretMasked: string | null }): IntegrationConfigView`
  - `buildWechatUpsertArgs(input: { tenantId: string; appId: string; enabled: boolean; secretEnc: string | null })`
  - `buildXfyunUpsertArgs(input: { tenantId: string; appId: string; enabled: boolean; apiKeyEnc: string | null; apiSecretEnc: string | null })`
  - `buildTiandituUpsertArgs(input: { tenantId: string; key: string; enabled: boolean })`
  - `resolveEnabledTiandituKey(row: Pick<IntegrationRow, 'enabled' | 'appId'> | null): string | null`
  - `canUseWechatTenant(row: Pick<IntegrationRow, 'enabled' | 'secretEnc'> | null): boolean`
  - `canUseXfyunCredentials(row: Pick<IntegrationRow, 'enabled' | 'appId' | 'apiKeyEnc' | 'apiSecretEnc'> | null): boolean`

- [ ] **Step 1: Write failing tests**

Use this test file:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildIntegrationConfigView,
  buildTiandituUpsertArgs,
  buildWechatUpsertArgs,
  buildXfyunUpsertArgs,
  canUseWechatTenant,
  canUseXfyunCredentials,
  resolveEnabledTiandituKey,
} from './integration-config.model';

describe('integration config model helpers', () => {
  const baseRow = {
    id: 'i1',
    tenantId: 't1',
    provider: 'wechat',
    appId: 'wxAPP',
    secretEnc: 'ENC(secret)',
    apiKeyEnc: null,
    apiSecretEnc: null,
    enabled: true,
  };

  it('projects integration config views with masked values supplied by service', () => {
    expect(buildIntegrationConfigView({
      row: baseRow,
      secretMasked: '****1234',
      apiKeyMasked: null,
      apiSecretMasked: null,
    })).toEqual({
      provider: 'wechat',
      appId: 'wxAPP',
      secretMasked: '****1234',
      apiKeyMasked: null,
      apiSecretMasked: null,
      enabled: true,
    });
  });

  it('builds WeChat upsert args with sparse secret update', () => {
    expect(buildWechatUpsertArgs({
      tenantId: 't1',
      appId: 'wxAPP',
      enabled: true,
      secretEnc: 'ENC(secret)',
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'wechat' } },
      create: { tenantId: 't1', provider: 'wechat', appId: 'wxAPP', secretEnc: 'ENC(secret)', enabled: true },
      update: { appId: 'wxAPP', enabled: true, secretEnc: 'ENC(secret)' },
    });

    expect(buildWechatUpsertArgs({
      tenantId: 't1',
      appId: 'wxAPP2',
      enabled: false,
      secretEnc: null,
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'wechat' } },
      create: { tenantId: 't1', provider: 'wechat', appId: 'wxAPP2', secretEnc: null, enabled: false },
      update: { appId: 'wxAPP2', enabled: false },
    });
  });

  it('builds Xfyun upsert args with sparse API key updates', () => {
    expect(buildXfyunUpsertArgs({
      tenantId: 't1',
      appId: 'xf01',
      enabled: true,
      apiKeyEnc: 'ENC(key)',
      apiSecretEnc: 'ENC(secret)',
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'xfyun' } },
      create: { tenantId: 't1', provider: 'xfyun', appId: 'xf01', apiKeyEnc: 'ENC(key)', apiSecretEnc: 'ENC(secret)', enabled: true },
      update: { appId: 'xf01', enabled: true, apiKeyEnc: 'ENC(key)', apiSecretEnc: 'ENC(secret)' },
    });

    expect(buildXfyunUpsertArgs({
      tenantId: 't1',
      appId: 'xf02',
      enabled: false,
      apiKeyEnc: null,
      apiSecretEnc: null,
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'xfyun' } },
      create: { tenantId: 't1', provider: 'xfyun', appId: 'xf02', apiKeyEnc: null, apiSecretEnc: null, enabled: false },
      update: { appId: 'xf02', enabled: false },
    });
  });

  it('builds Tianditu upsert args using plaintext key as appId', () => {
    expect(buildTiandituUpsertArgs({ tenantId: 't1', key: 'TDT_KEY', enabled: true })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'tianditu' } },
      create: { tenantId: 't1', provider: 'tianditu', appId: 'TDT_KEY', enabled: true },
      update: { appId: 'TDT_KEY', enabled: true },
    });
  });

  it('resolves enabled Tianditu key only when row is enabled and has appId', () => {
    expect(resolveEnabledTiandituKey(null)).toBeNull();
    expect(resolveEnabledTiandituKey({ enabled: false, appId: 'TDT_KEY' })).toBeNull();
    expect(resolveEnabledTiandituKey({ enabled: true, appId: null })).toBeNull();
    expect(resolveEnabledTiandituKey({ enabled: true, appId: 'TDT_KEY' })).toBe('TDT_KEY');
  });

  it('checks whether WeChat and Xfyun credentials are usable', () => {
    expect(canUseWechatTenant(null)).toBe(false);
    expect(canUseWechatTenant({ enabled: false, secretEnc: 'ENC(secret)' })).toBe(false);
    expect(canUseWechatTenant({ enabled: true, secretEnc: null })).toBe(false);
    expect(canUseWechatTenant({ enabled: true, secretEnc: 'ENC(secret)' })).toBe(true);

    expect(canUseXfyunCredentials(null)).toBe(false);
    expect(canUseXfyunCredentials({ enabled: false, appId: 'app', apiKeyEnc: 'key', apiSecretEnc: 'secret' })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: null, apiKeyEnc: 'key', apiSecretEnc: 'secret' })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: 'app', apiKeyEnc: null, apiSecretEnc: 'secret' })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: 'app', apiKeyEnc: 'key', apiSecretEnc: null })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: 'app', apiKeyEnc: 'key', apiSecretEnc: 'secret' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/integration/integration-config.model.spec.ts
```

Expected: FAIL because `./integration-config.model` does not exist.

---

### Task 2: Implement Integration Config Model Helpers

**Files:**
- Create: `packages/backend/src/modules/integration/integration-config.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Use this implementation:

```typescript
import type { IntegrationConfigView, IntegrationProvider } from '@nongchang/shared';

export interface IntegrationRow {
  id: string;
  tenantId: string;
  provider: string;
  appId: string | null;
  secretEnc: string | null;
  apiKeyEnc: string | null;
  apiSecretEnc: string | null;
  enabled: boolean;
}

export function buildIntegrationConfigView(input: {
  row: IntegrationRow;
  secretMasked: string | null;
  apiKeyMasked: string | null;
  apiSecretMasked: string | null;
}): IntegrationConfigView {
  return {
    provider: input.row.provider as IntegrationProvider,
    appId: input.row.appId ?? null,
    secretMasked: input.secretMasked,
    apiKeyMasked: input.apiKeyMasked,
    apiSecretMasked: input.apiSecretMasked,
    enabled: input.row.enabled,
  };
}

export function buildWechatUpsertArgs(input: { tenantId: string; appId: string; enabled: boolean; secretEnc: string | null }) {
  const update: Record<string, unknown> = { appId: input.appId, enabled: input.enabled };
  if (input.secretEnc) update.secretEnc = input.secretEnc;
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: 'wechat' } },
    create: { tenantId: input.tenantId, provider: 'wechat', appId: input.appId, secretEnc: input.secretEnc, enabled: input.enabled },
    update,
  };
}

export function buildXfyunUpsertArgs(input: {
  tenantId: string;
  appId: string;
  enabled: boolean;
  apiKeyEnc: string | null;
  apiSecretEnc: string | null;
}) {
  const update: Record<string, unknown> = { appId: input.appId, enabled: input.enabled };
  if (input.apiKeyEnc) update.apiKeyEnc = input.apiKeyEnc;
  if (input.apiSecretEnc) update.apiSecretEnc = input.apiSecretEnc;
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: 'xfyun' } },
    create: {
      tenantId: input.tenantId,
      provider: 'xfyun',
      appId: input.appId,
      apiKeyEnc: input.apiKeyEnc,
      apiSecretEnc: input.apiSecretEnc,
      enabled: input.enabled,
    },
    update,
  };
}

export function buildTiandituUpsertArgs(input: { tenantId: string; key: string; enabled: boolean }) {
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: 'tianditu' } },
    create: { tenantId: input.tenantId, provider: 'tianditu', appId: input.key, enabled: input.enabled },
    update: { appId: input.key, enabled: input.enabled },
  };
}

export function resolveEnabledTiandituKey(row: Pick<IntegrationRow, 'enabled' | 'appId'> | null): string | null {
  if (!row || !row.enabled || !row.appId) return null;
  return row.appId;
}

export function canUseWechatTenant(row: Pick<IntegrationRow, 'enabled' | 'secretEnc'> | null): boolean {
  return !!row?.enabled && !!row.secretEnc;
}

export function canUseXfyunCredentials(
  row: Pick<IntegrationRow, 'enabled' | 'appId' | 'apiKeyEnc' | 'apiSecretEnc'> | null,
): boolean {
  return !!row?.enabled && !!row.appId && !!row.apiKeyEnc && !!row.apiSecretEnc;
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/integration/integration-config.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire IntegrationConfigService

**Files:**
- Modify: `packages/backend/src/modules/integration/integration-config.service.ts`

**Interfaces:**
- Consumes helpers from `./integration-config.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  buildIntegrationConfigView,
  buildTiandituUpsertArgs,
  buildWechatUpsertArgs,
  buildXfyunUpsertArgs,
  canUseWechatTenant,
  canUseXfyunCredentials,
  resolveEnabledTiandituKey,
} from './integration-config.model';
import type { IntegrationRow } from './integration-config.model';
```

Replace:
- Local `IntegrationRow` interface with imported type.
- `toView` implementation with `buildIntegrationConfigView({ row, secretMasked: this.maskOrNull(row.secretEnc), apiKeyMasked: this.maskOrNull(row.apiKeyEnc), apiSecretMasked: this.maskOrNull(row.apiSecretEnc) })`.
- WeChat inline upsert args with `buildWechatUpsertArgs({ tenantId: user.tenantId, appId: dto.appId, enabled, secretEnc })`.
- Xfyun inline upsert args with `buildXfyunUpsertArgs({ tenantId: user.tenantId, appId: dto.appId, enabled, apiKeyEnc, apiSecretEnc })`.
- Tianditu inline upsert args with `buildTiandituUpsertArgs({ tenantId: user.tenantId, key: dto.key, enabled })`.
- `getEnabledTiandituKey` condition with `resolveEnabledTiandituKey(row)`.
- `findTenantByWechatAppId` condition with `canUseWechatTenant(row)`.
- `getEnabledXfyun` condition with `canUseXfyunCredentials(row)`.

Keep:
- `maskOrNull` method in service because it uses `EncryptionService`.
- `findRow` query shape.
- First-time validation exception messages.
- Encryption and decryption calls in service.
- WeChat `findFirst` query constrained to `{ appId, provider: 'wechat' }`.

- [ ] **Step 2: Run focused integration tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/integration/integration-config.model.spec.ts src/modules/integration/integration-config.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify and Review

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

Review P18 integration config model boundary. Ensure no controller/DTO/query/crypto behavior changed. Verify view projection, masking handoff, sparse secret update behavior, enabled defaults, Tianditu plaintext key behavior, WeChat tenant lookup gating, and Xfyun credential gating match previous behavior.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p18-integration-config-model-boundary.md packages/backend/src/modules/integration/integration-config.model.ts packages/backend/src/modules/integration/integration-config.model.spec.ts packages/backend/src/modules/integration/integration-config.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract integration config model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers config view projection, sparse upsert data, Tianditu key exposure, WeChat tenant lookup gating, Xfyun credential gating, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
