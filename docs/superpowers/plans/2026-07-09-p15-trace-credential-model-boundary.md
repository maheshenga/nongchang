# P15 Trace Credential Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic trace credential helpers from `TraceCredentialService` so credential projection, create data, trusted origin parsing, and trusted file URL decisions are directly tested.

**Architecture:** `TraceCredentialService` remains responsible for scope checks, Prisma reads/writes, and choosing which trusted origins to load from tenant/env configuration. A new `trace-credential.model.ts` owns pure model projection, Prisma create-data shaping, URL origin parsing, and trusted-file URL validation decisions with no database side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` trace credential DTO and response types.

## Global Constraints

- Do not change trace credential controller routes, DTO schemas, API response shape, query shape, scope checks, or Prisma write targets.
- Preserve list ordering: `{ createdAt: 'desc' }`.
- Preserve `toView` response semantics: `type` cast to `TraceCredentialType`, `issuedAt` nullable ISO string, `createdAt` ISO string.
- Preserve create data semantics: `tenantId`, `batchId`, `type`, `title`, `issuer`, `fileUrl`; `serialNo: input.serialNo ?? null`; `issuedAt: input.issuedAt ? new Date(input.issuedAt) : null`.
- Preserve trusted origin behavior: enabled tenant OSS `baseUrl` contributes its URL origin; `process.env.OSS_BASE_URL` contributes its URL origin; invalid configured origins are ignored.
- Preserve trusted URL errors: invalid file URL message is `资质文件 URL 无效`; no configured trusted origin message is `No trusted storage origin is configured for credential files`; untrusted origin message is `资质文件 URL 不在可信存储域名内`.
- Preserve fail-closed behavior: `create`, `list`, and `remove` must still assert batch/resource scope before writes/deletes.

---

## File Structure

- Create `packages/backend/src/modules/trace-credential/trace-credential.model.ts`
  - Pure helpers for credential projection, create data, trusted origin parsing, and trusted file URL decision.
- Create `packages/backend/src/modules/trace-credential/trace-credential.model.spec.ts`
  - Direct helper tests for projection, create data, origin parsing, and URL validation decisions.
- Modify `packages/backend/src/modules/trace-credential/trace-credential.service.ts`
  - Replace inline pure logic with imports from `trace-credential.model.ts`.

---

### Task 1: Add Trace Credential Model Tests

**Files:**
- Create: `packages/backend/src/modules/trace-credential/trace-credential.model.spec.ts`

**Interfaces:**
- Future exports:
  - `CredentialRow`
  - `OssConfigRow`
  - `toTraceCredentialView(row: CredentialRow): TraceCredentialView`
  - `buildTraceCredentialCreateData(input: { tenantId: string; dto: CreateTraceCredentialInput })`
  - `addTrustedOrigin(origins: Set<string>, rawUrl: string | null | undefined): void`
  - `buildTrustedFileOrigins(input: { ossConfig: OssConfigRow | null; envBaseUrl?: string | null }): Set<string>`
  - `validateTrustedFileUrl(fileUrl: string, trustedOrigins: ReadonlySet<string>): { ok: true } | { ok: false; reason: 'invalid-url' | 'missing-trusted-origin' | 'untrusted-origin' }`
  - `TRACE_CREDENTIAL_INVALID_URL_MESSAGE`
  - `TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE`
  - `TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE`

- [ ] **Step 1: Write failing tests**

Use this test file:

```typescript
import { describe, expect, it } from 'vitest';
import {
  TRACE_CREDENTIAL_INVALID_URL_MESSAGE,
  TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE,
  TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE,
  addTrustedOrigin,
  buildTraceCredentialCreateData,
  buildTrustedFileOrigins,
  toTraceCredentialView,
  validateTrustedFileUrl,
} from './trace-credential.model';

describe('trace credential model helpers', () => {
  it('projects credential rows with nullable issuedAt and ISO createdAt', () => {
    expect(toTraceCredentialView({
      id: 'cr1',
      batchId: 'b1',
      type: 'certificate',
      title: 'Organic certificate',
      issuer: 'Certification Center',
      serialNo: 'OC-2026-001',
      issuedAt: new Date('2026-06-01T00:00:00.000Z'),
      fileUrl: 'https://oss.example.com/cert.pdf',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    })).toEqual({
      id: 'cr1',
      batchId: 'b1',
      type: 'certificate',
      title: 'Organic certificate',
      issuer: 'Certification Center',
      serialNo: 'OC-2026-001',
      issuedAt: '2026-06-01T00:00:00.000Z',
      fileUrl: 'https://oss.example.com/cert.pdf',
      createdAt: '2026-06-15T00:00:00.000Z',
    });

    expect(toTraceCredentialView({
      id: 'cr2',
      batchId: 'b1',
      type: 'report',
      title: 'Residue report',
      issuer: 'SGS',
      serialNo: null,
      issuedAt: null,
      fileUrl: 'https://oss.example.com/report.pdf',
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
    }).issuedAt).toBeNull();
  });

  it('builds create data with tenant id and nullable optional fields', () => {
    expect(buildTraceCredentialCreateData({
      tenantId: 't1',
      dto: {
        batchId: 'b1',
        type: 'certificate',
        title: 'Organic certificate',
        issuer: 'Certification Center',
        serialNo: 'OC-2026-001',
        issuedAt: '2026-06-01T00:00:00.000Z',
        fileUrl: 'https://oss.example.com/cert.pdf',
      },
    })).toEqual({
      tenantId: 't1',
      batchId: 'b1',
      type: 'certificate',
      title: 'Organic certificate',
      issuer: 'Certification Center',
      serialNo: 'OC-2026-001',
      issuedAt: new Date('2026-06-01T00:00:00.000Z'),
      fileUrl: 'https://oss.example.com/cert.pdf',
    });

    expect(buildTraceCredentialCreateData({
      tenantId: 't1',
      dto: {
        batchId: 'b1',
        type: 'report',
        title: 'Residue report',
        issuer: 'SGS',
        fileUrl: 'https://oss.example.com/report.pdf',
      },
    })).toMatchObject({
      serialNo: null,
      issuedAt: null,
    });
  });

  it('adds trusted origins from valid urls and ignores blank or invalid urls', () => {
    const origins = new Set<string>();

    addTrustedOrigin(origins, 'https://oss.example.com/uploads/path');
    addTrustedOrigin(origins, 'not-a-url');
    addTrustedOrigin(origins, null);
    addTrustedOrigin(origins, undefined);

    expect([...origins]).toEqual(['https://oss.example.com']);
  });

  it('builds trusted file origins from enabled tenant config and env base url', () => {
    const origins = buildTrustedFileOrigins({
      ossConfig: { enabled: true, baseUrl: 'https://tenant.example.com/uploads' },
      envBaseUrl: 'https://env.example.com/public',
    });

    expect(origins.has('https://tenant.example.com')).toBe(true);
    expect(origins.has('https://env.example.com')).toBe(true);
  });

  it('does not trust disabled tenant config base url', () => {
    const origins = buildTrustedFileOrigins({
      ossConfig: { enabled: false, baseUrl: 'https://tenant.example.com/uploads' },
      envBaseUrl: null,
    });

    expect(origins.size).toBe(0);
  });

  it('validates trusted file urls by origin only', () => {
    expect(validateTrustedFileUrl(
      'https://oss.example.com/other-folder/cert.pdf',
      new Set(['https://oss.example.com']),
    )).toEqual({ ok: true });
  });

  it('returns stable validation reasons and messages for unsafe urls', () => {
    expect(validateTrustedFileUrl('not-a-url', new Set(['https://oss.example.com']))).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
    expect(validateTrustedFileUrl('https://oss.example.com/cert.pdf', new Set())).toEqual({
      ok: false,
      reason: 'missing-trusted-origin',
    });
    expect(validateTrustedFileUrl('https://evil.example/cert.pdf', new Set(['https://oss.example.com']))).toEqual({
      ok: false,
      reason: 'untrusted-origin',
    });
    expect(TRACE_CREDENTIAL_INVALID_URL_MESSAGE).toBe('资质文件 URL 无效');
    expect(TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE).toBe('No trusted storage origin is configured for credential files');
    expect(TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE).toBe('资质文件 URL 不在可信存储域名内');
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace-credential/trace-credential.model.spec.ts
```

Expected: FAIL because `./trace-credential.model` does not exist.

---

### Task 2: Implement Trace Credential Model Helpers

**Files:**
- Create: `packages/backend/src/modules/trace-credential/trace-credential.model.ts`

**Interfaces:**
- Produces the helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Use this implementation:

```typescript
import type { CreateTraceCredentialInput, TraceCredentialType, TraceCredentialView } from '@nongchang/shared';

export const TRACE_CREDENTIAL_INVALID_URL_MESSAGE = '资质文件 URL 无效';
export const TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE = 'No trusted storage origin is configured for credential files';
export const TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE = '资质文件 URL 不在可信存储域名内';

export interface CredentialRow {
  id: string;
  batchId: string;
  type: string;
  title: string;
  issuer: string;
  serialNo: string | null;
  issuedAt: Date | null;
  fileUrl: string;
  createdAt: Date;
}

export interface OssConfigRow {
  enabled: boolean;
  baseUrl: string | null;
}

export type TrustedFileUrlValidation =
  | { ok: true }
  | { ok: false; reason: 'invalid-url' | 'missing-trusted-origin' | 'untrusted-origin' };

export function toTraceCredentialView(row: CredentialRow): TraceCredentialView {
  return {
    id: row.id,
    batchId: row.batchId,
    type: row.type as TraceCredentialType,
    title: row.title,
    issuer: row.issuer,
    serialNo: row.serialNo,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    fileUrl: row.fileUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildTraceCredentialCreateData(input: { tenantId: string; dto: CreateTraceCredentialInput }) {
  return {
    tenantId: input.tenantId,
    batchId: input.dto.batchId,
    type: input.dto.type,
    title: input.dto.title,
    issuer: input.dto.issuer,
    serialNo: input.dto.serialNo ?? null,
    issuedAt: input.dto.issuedAt ? new Date(input.dto.issuedAt) : null,
    fileUrl: input.dto.fileUrl,
  };
}

export function addTrustedOrigin(origins: Set<string>, rawUrl: string | null | undefined): void {
  if (!rawUrl) return;
  try {
    origins.add(new URL(rawUrl).origin);
  } catch {
    // Ignore invalid trusted URL configuration; upload itself will have failed earlier.
  }
}

export function buildTrustedFileOrigins(input: { ossConfig: OssConfigRow | null; envBaseUrl?: string | null }): Set<string> {
  const origins = new Set<string>();
  if (input.ossConfig?.enabled) addTrustedOrigin(origins, input.ossConfig.baseUrl);
  addTrustedOrigin(origins, input.envBaseUrl);
  return origins;
}

export function validateTrustedFileUrl(fileUrl: string, trustedOrigins: ReadonlySet<string>): TrustedFileUrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (trustedOrigins.size === 0) return { ok: false, reason: 'missing-trusted-origin' };
  if (!trustedOrigins.has(parsed.origin)) return { ok: false, reason: 'untrusted-origin' };
  return { ok: true };
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace-credential/trace-credential.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire TraceCredentialService

**Files:**
- Modify: `packages/backend/src/modules/trace-credential/trace-credential.service.ts`

**Interfaces:**
- Consumes helpers from `./trace-credential.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  TRACE_CREDENTIAL_INVALID_URL_MESSAGE,
  TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE,
  TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE,
  buildTraceCredentialCreateData,
  buildTrustedFileOrigins,
  toTraceCredentialView,
  validateTrustedFileUrl,
} from './trace-credential.model';
import type { CredentialRow, OssConfigRow } from './trace-credential.model';
```

Update service behavior:

```typescript
  private async trustedFileOrigins(tenantId: string): Promise<Set<string>> {
    const ossConfig = (await this.prisma.ossConfig.findUnique({
      where: { tenantId },
      select: { enabled: true, baseUrl: true },
    })) as OssConfigRow | null;
    return buildTrustedFileOrigins({ ossConfig, envBaseUrl: process.env.OSS_BASE_URL });
  }

  private async assertTrustedFileUrl(tenantId: string, fileUrl: string): Promise<void> {
    const result = validateTrustedFileUrl(fileUrl, await this.trustedFileOrigins(tenantId));
    if (result.ok) return;
    if (result.reason === 'invalid-url') throw new BadRequestException(TRACE_CREDENTIAL_INVALID_URL_MESSAGE);
    if (result.reason === 'missing-trusted-origin') throw new BadRequestException(TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE);
    throw new BadRequestException(TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE);
  }
```

Replace:
- `rows.map(toView)` with `rows.map(toTraceCredentialView)`.
- Inline `traceCredential.create({ data: ... })` data with `buildTraceCredentialCreateData({ tenantId: user.tenantId, dto: input })`.
- `return toView(row)` with `return toTraceCredentialView(row)`.

Remove:
- Local `CredentialRow` interface.
- Local `OssConfigRow` interface.
- Local `toView` helper.
- Local `addOrigin` method.

Keep:
- `BadRequestException`, `ForbiddenException`, `Injectable` imports.
- `CreateTraceCredentialInput` and `TraceCredentialView` service signatures.
- Scope checks before list/create/remove data access.
- `traceCredential.findMany` query and order.
- `traceCredential.findFirst` and delete behavior in `remove`.

- [ ] **Step 2: Run focused trace credential tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace-credential/trace-credential.model.spec.ts src/modules/trace-credential/trace-credential.service.spec.ts
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

Review P15 trace credential model boundary. Ensure no controller/DTO/query/response/scope behavior changed. Verify projection, create data, trusted-origin building, invalid configured origin ignoring, invalid file URL rejection, missing trusted-origin rejection, untrusted-origin rejection, and delete fail-closed behavior match previous behavior.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p15-trace-credential-model-boundary.md packages/backend/src/modules/trace-credential/trace-credential.model.ts packages/backend/src/modules/trace-credential/trace-credential.model.spec.ts packages/backend/src/modules/trace-credential/trace-credential.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract trace credential model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers credential projection, create data, trusted-origin construction, trusted file URL decisions, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
