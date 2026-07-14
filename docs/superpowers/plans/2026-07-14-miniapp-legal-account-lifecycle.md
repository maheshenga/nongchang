# Miniapp Legal And Account Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly disabled subagent execution for this project.

**Goal:** Ship tenant-configurable miniapp legal documents, versioned consent evidence, a live personal-data view with bounded JSON export, and irreversible self-service account closure that preserves production and financial history.

**Architecture:** Add immutable legal publications and consent records behind a dedicated NestJS legal module, then route only miniapp authentication through publication-aware endpoints. Keep account data live and user-scoped in an account data service, and perform account anonymization through a separate lifecycle service that strongly reauthenticates, increments `sessionVersion`, and invalidates the session cache. The Web app gains a system-admin legal publishing surface; the Taro miniapp gains reusable legal consent, legal-document, data, and closure pages.

**Tech Stack:** TypeScript 5.8, Zod 3, NestJS 11, Prisma 6/PostgreSQL/PostGIS, React 19/Vite 8, Taro 4/React 18, Vitest, Testing Library, Supertest, Playwright, pnpm 10.33.2

## Global Constraints

- Work only in `E:\code\nongchang\.worktrees\baota-production-launch-p0` on branch `codex/baota-production-launch-p0`.
- Use `corepack pnpm@10.33.2` for every pnpm command.
- Follow RED-GREEN-REFACTOR for every behavior change and commit after each independently reviewable task.
- Do not use the `using-superpowers` skill and do not dispatch subagents.
- Keep `/auth/login`, `/auth/wechat`, `/auth/wechat/register`, and all Web session routes backward compatible; legal consent is mandatory only on the new `/auth/miniapp/*` routes.
- Legal configuration is tenant-scoped, plain text only, and writable only by `system_admin` in that tenant.
- Legal drafts are editable; published snapshots and consent rows are immutable through application APIs.
- A legal draft requires operator name `2..128`, contact address `2..256`, privacy contact `2..64`, version strings `1..32`, both document bodies `200..50_000`, an effective date no later than today, and at least one of phone or email.
- Miniapp login and registration fail closed when a current publication cannot be loaded or when the submitted publication is stale or cross-tenant.
- Personal-data queries never accept a user ID from client input; every query uses `AuthUser.tenantId` and `AuthUser.userId` or a relation derived from them.
- Preview returns counts and the latest `20` records per category.
- Export rejects any category above `10_000` rows and rejects serialized JSON above `10 MiB`; it never truncates and never persists a second export copy.
- Self-service closure is allowed only for backend roles `merchant` and `member`; `platform_admin`, `system_admin`, and `agent_admin` are rejected by the backend and hidden in the miniapp.
- Password accounts verify the current password. WeChat accounts obtain a fresh code and must match both the current tenant and stored OpenID.
- Closure sets `status = 'deleted'`, replaces username/display name/password, clears phone/OpenID/group, increments `sessionVersion`, invalidates session cache, and retains the stable user ID, tenant ID, role, and all business relations.
- No task may hard-delete production, traceability, audit, payment, order, credit, upload, or ledger history.

---

### Task 1: Define shared legal, consent, account-data, and closure contracts

**Files:**
- Create: `packages/shared/src/dto/legal.dto.ts`
- Create: `packages/shared/src/dto/account-lifecycle.dto.ts`
- Create: `packages/shared/src/dto/legal.dto.spec.ts`
- Create: `packages/shared/src/dto/account-lifecycle.dto.spec.ts`
- Modify: `packages/shared/src/dto/auth.dto.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/src/auth/auth.service.spec.ts`
- Modify: `packages/web/src/auth/auth-context.spec.tsx`
- Modify: `packages/web/src/components/ProfileSettings.spec.tsx`

**Interfaces:**
- Produces `LegalDocumentPayload`, `LegalSettingsView`, `PublicLegalQuery`, `PublicLegalResponse`, and `LegalPublicationSummary`.
- Produces `MiniappLoginDto`, `MiniappWechatLoginDto`, and `MiniappWechatRegisterDto`, each with `publicationId: string`.
- Extends `MeProfileView` with `deletionVerification: 'password' | 'wechat'`.
- Produces `AccountDataPreview`, `AccountDataExport`, and `CloseAccountInput` without password hashes, OpenIDs, token/session fields, object keys, provider secrets, payment secrets, or other users' personal fields.

- [ ] **Step 1: Write failing legal contract tests**

Create `packages/shared/src/dto/legal.dto.spec.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';
import {
  legalDocumentPayloadSchema,
  publicLegalQuerySchema,
  publicLegalResponseSchema,
} from './legal.dto';

const valid = {
  operatorName: '示例农业科技有限公司',
  contactAddress: '浙江省杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-2026-07',
  agreementVersion: 'agreement-2026-07',
  effectiveDate: '2026-07-14',
  privacyPolicyText: '隐私政策正文'.repeat(80),
  userAgreementText: '用户协议正文'.repeat(80),
};

describe('legal contracts', () => {
  it('accepts a complete plain-text legal draft', () => {
    expect(legalDocumentPayloadSchema.parse(valid)).toEqual(valid);
  });

  it('requires a phone or email and rejects short or future content', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...valid,
      contactPhone: null,
      contactEmail: null,
    })).toThrow();
    expect(() => legalDocumentPayloadSchema.parse({ ...valid, privacyPolicyText: '过短' })).toThrow();
    expect(() => legalDocumentPayloadSchema.parse({ ...valid, effectiveDate: '2999-01-01' })).toThrow();
  });

  it('normalizes public lookup and requires tenantCode or appId', () => {
    expect(publicLegalQuerySchema.parse({ tenantCode: ' demo ' })).toEqual({ tenantCode: 'DEMO' });
    expect(() => publicLegalQuerySchema.parse({})).toThrow();
  });

  it('keeps unconfigured responses free of draft content', () => {
    const parsed = publicLegalResponseSchema.parse({
      configured: false,
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.configured).toBe(false);
    expect(parsed).not.toHaveProperty('privacyPolicyText');
  });
});
```

- [ ] **Step 2: Write failing account lifecycle contract tests**

Create `packages/shared/src/dto/account-lifecycle.dto.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  accountDataExportSchema,
  closeAccountSchema,
  meProfileViewSchema,
} from '../index';

describe('account lifecycle contracts', () => {
  it('requires the exact destructive confirmation and method-specific proof', () => {
    expect(closeAccountSchema.parse({
      method: 'password',
      currentPassword: 'password123',
      confirmation: '注销账号',
    }).method).toBe('password');
    expect(closeAccountSchema.parse({
      method: 'wechat',
      appId: 'wx-example',
      code: 'fresh-code',
      confirmation: '注销账号',
    }).method).toBe('wechat');
    expect(() => closeAccountSchema.parse({
      method: 'password',
      currentPassword: 'password123',
      confirmation: '确认',
    })).toThrow();
  });

  it('exposes only the verification method on the safe profile', () => {
    const profile = meProfileViewSchema.parse({
      id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
      displayName: '示例基地', phone: null, status: 'active', deletionVerification: 'wechat',
    });
    expect(profile.deletionVerification).toBe('wechat');
    expect(profile).not.toHaveProperty('wxOpenid');
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('rejects sensitive fields inside an export payload', () => {
    const base = {
      schemaVersion: 1 as const,
      generatedAt: '2026-07-14T00:00:00.000Z',
      tenant: { id: 't1', code: 'DEMO', name: '示例租户' },
      account: {
        id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
        displayName: '示例基地', phone: null, status: 'active', deletionVerification: 'password' as const,
      },
      data: {
        fields: [], batches: [], farmRecords: [], supplies: [], supplyIssues: [],
        uploads: [], aiOperations: [], creditOrders: [], creditAccount: null,
      },
      exclusions: ['不包含密码、令牌、OpenID、第三方密钥和其他用户资料。'],
    };
    expect(accountDataExportSchema.parse(base).schemaVersion).toBe(1);
    expect(() => accountDataExportSchema.parse({
      ...base,
      account: { ...base.account, passwordHash: 'secret' },
    })).toThrow();
  });
});
```

- [ ] **Step 3: Run the shared tests and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared exec vitest run src/dto/legal.dto.spec.ts src/dto/account-lifecycle.dto.spec.ts
```

Expected: module-not-found and missing-export failures for the new schemas.

- [ ] **Step 4: Add the legal schemas**

Create `packages/shared/src/dto/legal.dto.ts` with this public shape and validation:

```ts
import { z } from 'zod';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  value => value <= new Date().toISOString().slice(0, 10),
  '生效日期不能晚于今天',
);
const nullableTrimmed = (min: number, max: number) =>
  z.string().trim().min(min).max(max).nullable();

const legalDocumentPayloadShape = {
  operatorName: z.string().trim().min(2).max(128),
  contactAddress: z.string().trim().min(2).max(256),
  privacyContact: z.string().trim().min(2).max(64),
  contactPhone: nullableTrimmed(5, 32),
  contactEmail: z.string().trim().email().max(128).nullable(),
  privacyVersion: z.string().trim().min(1).max(32),
  agreementVersion: z.string().trim().min(1).max(32),
  effectiveDate: dateOnlySchema,
  privacyPolicyText: z.string().min(200).max(50_000),
  userAgreementText: z.string().min(200).max(50_000),
};

export const legalDocumentPayloadSchema = z.object(legalDocumentPayloadShape).strict().refine(
  value => Boolean(value.contactPhone || value.contactEmail),
  {
    message: '联系电话和联系邮箱至少填写一项',
    path: ['contactPhone'],
  },
);
export type LegalDocumentPayload = z.infer<typeof legalDocumentPayloadSchema>;

export const legalPublicationSummarySchema = z.object({
  id: z.string().uuid(),
  privacyVersion: z.string(),
  agreementVersion: z.string(),
  effectiveDate: dateOnlySchema,
  publishedAt: z.string().datetime(),
}).strict();
export type LegalPublicationSummary = z.infer<typeof legalPublicationSummarySchema>;

export const legalSettingsViewSchema = z.object({
  draft: legalDocumentPayloadSchema.nullable(),
  currentPublication: legalPublicationSummarySchema.nullable(),
}).strict();
export type LegalSettingsView = z.infer<typeof legalSettingsViewSchema>;

export const publicLegalQuerySchema = z.object({
  tenantCode: z.string().trim().min(1).max(64).transform(value => value.toUpperCase()).optional(),
  appId: z.string().trim().min(1).max(128).optional(),
}).strict().refine(value => Boolean(value.tenantCode || value.appId), {
  message: 'tenantCode 或 appId 至少提供一项',
});
export type PublicLegalQuery = z.infer<typeof publicLegalQuerySchema>;

const publicLegalConfiguredSchema = z.object({
  ...legalDocumentPayloadShape,
  configured: z.literal(true),
  tenantId: z.string().uuid(),
  publicationId: z.string().uuid(),
  publishedAt: z.string().datetime(),
}).strict();
const publicLegalUnconfiguredSchema = z.object({
  configured: z.literal(false),
  tenantId: z.string().uuid(),
}).strict();

export const publicLegalResponseSchema = z.discriminatedUnion('configured', [
  publicLegalConfiguredSchema,
  publicLegalUnconfiguredSchema,
]);
export type PublicLegalResponse = z.infer<typeof publicLegalResponseSchema>;
export type ConfiguredPublicLegal = Extract<PublicLegalResponse, { configured: true }>;
```

- [ ] **Step 5: Add miniapp-auth consent schemas and safe profile verification**

In `packages/shared/src/dto/auth.dto.ts`, import `wechatLoginSchema` and `wechatRegisterSchema`, extend the profile, and export these schemas:

```ts
import { wechatLoginSchema, wechatRegisterSchema } from './integration.dto';

const publicationIdSchema = z.string().uuid();

export const miniappLoginSchema = loginSchema.extend({ publicationId: publicationIdSchema }).strict();
export type MiniappLoginDto = z.infer<typeof miniappLoginSchema>;

export const miniappWechatLoginSchema = wechatLoginSchema.extend({ publicationId: publicationIdSchema }).strict();
export type MiniappWechatLoginDto = z.infer<typeof miniappWechatLoginSchema>;

export const miniappWechatRegisterSchema = wechatRegisterSchema.extend({ publicationId: publicationIdSchema }).strict();
export type MiniappWechatRegisterDto = z.infer<typeof miniappWechatRegisterSchema>;
```

Add this required field inside `meProfileViewSchema`:

```ts
deletionVerification: z.enum(['password', 'wechat']),
```

- [ ] **Step 6: Add precise personal-data and closure schemas**

Create `packages/shared/src/dto/account-lifecycle.dto.ts`. Use `.strict()` on every object and these exported roots:

```ts
import { z } from 'zod';
import { meProfileViewSchema } from './auth.dto';

const iso = z.string().datetime();
const nullableIso = iso.nullable();
const jsonValue = z.unknown().nullable();

export const closeAccountSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('password'),
    currentPassword: z.string().min(6).max(128),
    confirmation: z.literal('注销账号'),
  }).strict(),
  z.object({
    method: z.literal('wechat'),
    appId: z.string().min(1).max(128),
    code: z.string().min(1).max(256),
    confirmation: z.literal('注销账号'),
  }).strict(),
]);
export type CloseAccountInput = z.infer<typeof closeAccountSchema>;

export const accountFieldSchema = z.object({
  id: z.string(), name: z.string(), area: z.number(), createdAt: iso,
}).strict();
export const accountBatchSchema = z.object({
  id: z.string(), batchNo: z.string(), cropName: z.string(), status: z.string(),
  plantDate: iso, expectedHarvest: iso, createdAt: iso,
}).strict();
export const accountFarmRecordSchema = z.object({
  id: z.string(), batchId: z.string(), fieldId: z.string(), action: z.string(),
  detail: jsonValue, images: z.array(z.string()), location: z.string().nullable(),
  recordedAt: iso, source: z.string(), status: z.string(), createdAt: iso,
}).strict();
export const accountSupplySchema = z.object({
  id: z.string(), name: z.string(), unit: z.string(), total: z.number(), used: z.number(), createdAt: iso,
}).strict();
export const accountSupplyIssueSchema = z.object({
  id: z.string(), supplyId: z.string(), batchId: z.string(), amount: z.number(),
  unitPrice: z.number(), createdAt: iso,
}).strict();
export const accountUploadSchema = z.object({
  id: z.string(), purpose: z.string(), url: z.string().nullable(), sizeBytes: z.string(),
  status: z.string(), createdAt: iso,
}).strict();
export const accountAiOperationSchema = z.object({
  id: z.string(), kind: z.string(), status: z.string(), errorCategory: z.string().nullable(),
  createdAt: iso, updatedAt: iso,
}).strict();
export const accountCreditOrderSchema = z.object({
  id: z.string(), resource: z.string(), quantity: z.number(), amountCents: z.number(),
  status: z.string(), payChannel: z.string().nullable(), paidAt: nullableIso, createdAt: iso,
}).strict();
export const accountCreditLedgerSchema = z.object({
  id: z.string(), resource: z.string(), delta: z.number(), balanceAfter: z.number(),
  reason: z.string(), note: z.string().nullable(), createdAt: iso,
}).strict();
export const accountCreditAccountSchema = z.object({
  aiBalance: z.number(), codeBalance: z.number(), ledgers: z.array(accountCreditLedgerSchema),
}).strict();

const tenantIdentitySchema = z.object({ id: z.string(), code: z.string(), name: z.string() }).strict();
const countsSchema = z.object({
  fields: z.number().int().nonnegative(), batches: z.number().int().nonnegative(),
  farmRecords: z.number().int().nonnegative(), supplies: z.number().int().nonnegative(),
  supplyIssues: z.number().int().nonnegative(), uploads: z.number().int().nonnegative(),
  aiOperations: z.number().int().nonnegative(), creditOrders: z.number().int().nonnegative(),
  creditLedgers: z.number().int().nonnegative(),
}).strict();
const collectionsSchema = z.object({
  fields: z.array(accountFieldSchema),
  batches: z.array(accountBatchSchema),
  farmRecords: z.array(accountFarmRecordSchema),
  supplies: z.array(accountSupplySchema),
  supplyIssues: z.array(accountSupplyIssueSchema),
  uploads: z.array(accountUploadSchema),
  aiOperations: z.array(accountAiOperationSchema),
  creditOrders: z.array(accountCreditOrderSchema),
  creditAccount: accountCreditAccountSchema.nullable(),
}).strict();

export const accountDataPreviewSchema = z.object({
  generatedAt: iso,
  tenant: tenantIdentitySchema,
  account: meProfileViewSchema,
  counts: countsSchema,
  recent: collectionsSchema,
  recentLimit: z.literal(20),
}).strict();
export type AccountDataPreview = z.infer<typeof accountDataPreviewSchema>;

export const accountDataExportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: iso,
  tenant: tenantIdentitySchema,
  account: meProfileViewSchema,
  data: collectionsSchema,
  exclusions: z.array(z.string().min(1)).min(1),
}).strict();
export type AccountDataExport = z.infer<typeof accountDataExportSchema>;
```

- [ ] **Step 7: Export every schema and type from the shared package**

Update `packages/shared/src/index.ts` so consumers can import the new roots from `@nongchang/shared`. Export the new auth schemas/types alongside the current auth exports, then export all roots from `legal.dto.ts` and `account-lifecycle.dto.ts`.

- [ ] **Step 8: Run shared tests and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test
corepack pnpm@10.33.2 --filter @nongchang/shared build
```

Expected: all shared tests pass and TypeScript emits the package without errors.

- [ ] **Step 9: Keep existing profile consumers compiled at the new contract boundary**

Because `deletionVerification` is required, update `AuthService.getMe` and `updateMe` in the same task. Select `wxOpenid` only to derive `'wechat' | 'password'`, destructure it before returning, and test that the raw value and `passwordHash` remain absent. Add `deletionVerification: 'password'` to typed Web profile fixtures. Verify:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter web exec vitest run src/auth/auth-context.spec.tsx src/components/ProfileSettings.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: backend profile tests/build and Web profile tests/typecheck pass without exposing OpenID.

- [ ] **Step 10: Commit the shared contract boundary**

Run `git diff --check`, inspect only the planned files, then commit:

```powershell
git add -- packages/shared/src/dto/legal.dto.ts packages/shared/src/dto/legal.dto.spec.ts packages/shared/src/dto/account-lifecycle.dto.ts packages/shared/src/dto/account-lifecycle.dto.spec.ts packages/shared/src/dto/auth.dto.ts packages/shared/src/index.ts packages/backend/src/auth/auth.service.ts packages/backend/src/auth/auth.service.spec.ts packages/web/src/auth/auth-context.spec.tsx packages/web/src/components/ProfileSettings.spec.tsx docs/superpowers/plans/2026-07-14-miniapp-legal-account-lifecycle.md
git commit -m "feat(shared): define legal account lifecycle contracts"
```

---

### Task 2: Add immutable legal storage and tenant-scoped publication APIs

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260714100000_legal_publications_and_consents/migration.sql`
- Create: `packages/backend/src/modules/legal/legal.model.ts`
- Create: `packages/backend/src/modules/legal/legal.model.spec.ts`
- Create: `packages/backend/src/modules/legal/legal.service.ts`
- Create: `packages/backend/src/modules/legal/legal.service.spec.ts`
- Create: `packages/backend/src/modules/legal/legal-settings.controller.ts`
- Create: `packages/backend/src/modules/legal/legal-settings.controller.spec.ts`
- Create: `packages/backend/src/modules/legal/public-legal.controller.ts`
- Create: `packages/backend/src/modules/legal/legal.module.ts`
- Modify: `packages/backend/src/modules/integration/integration-config.service.ts`
- Modify: `packages/backend/src/modules/integration/integration-config.service.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- Produces `LegalService.getSettings(actor)`, `saveDraft(actor, input)`, `publish(actor)`, `getPublic(query)`, `getPrivacyContact(tenantId)`, `recordConsent({ tenantId, userId, publicationId })`, `requireCurrentPublication(tenantId, publicationId, db)`, and `createConsent(db, { tenantId, userId, publication })`.
- Produces `IntegrationConfigService.findEnabledWechatTenantId(appId)` without decrypting or returning credentials.
- Produces `GET/PUT/POST /legal-settings` routes restricted to `system_admin` and `GET /public/legal` as a throttled public route.

- [ ] **Step 1: Write failing model and service tests**

In `legal.model.spec.ts`, test date mapping and ensure the public unconfigured builder returns only `configured` and `tenantId`. In `legal.service.spec.ts`, use Prisma fakes to prove:

```ts
it('publishes an immutable snapshot and points the draft at it', async () => {
  const result = await service.publish(systemAdmin);
  expect(prisma.legalPublication.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ tenantId: 't1', privacyVersion: 'privacy-v1' }),
  }));
  expect(prisma.legalSettings.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { tenantId: 't1' },
    data: { currentPublicationId: 'publication-1' },
  }));
  expect(result.id).toBe('publication-1');
});

it('rejects mismatched tenantCode and appId without leaking either tenant', async () => {
  await expect(service.getPublic({ tenantCode: 'DEMO', appId: 'wx-other' }))
    .rejects.toBeInstanceOf(NotFoundException);
});

it('returns configured false without exposing the saved draft', async () => {
  await expect(service.getPublic({ tenantCode: 'DEMO' })).resolves.toEqual({
    configured: false,
    tenantId: 't1',
  });
});
```

Add an integration service test that `findEnabledWechatTenantId` selects only `{ tenantId: true }` and returns `null` for disabled or absent rows.

- [ ] **Step 2: Run focused backend tests and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/legal src/modules/integration/integration-config.service.spec.ts
```

Expected: missing-module and missing-method failures.

- [ ] **Step 3: Add Prisma relations and models**

Add these relations to `Tenant` and `User`:

```prisma
// Tenant
legalSettings     LegalSettings?
legalPublications LegalPublication[]
legalConsents     LegalConsent[]

// User
legalConsents LegalConsent[]
```

Add these models before the billing enums:

```prisma
model LegalSettings {
  id                   String            @id @default(uuid())
  tenantId             String            @unique @map("tenant_id")
  operatorName         String            @map("operator_name")
  contactAddress       String            @map("contact_address")
  privacyContact       String            @map("privacy_contact")
  contactPhone         String?           @map("contact_phone")
  contactEmail         String?           @map("contact_email")
  privacyVersion       String            @map("privacy_version")
  agreementVersion     String            @map("agreement_version")
  effectiveDate        DateTime          @map("effective_date") @db.Date
  privacyPolicyText    String            @map("privacy_policy_text") @db.Text
  userAgreementText    String            @map("user_agreement_text") @db.Text
  currentPublicationId String?           @unique @map("current_publication_id")
  createdAt            DateTime          @default(now()) @map("created_at")
  updatedAt            DateTime          @updatedAt @map("updated_at")
  tenant               Tenant            @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  currentPublication   LegalPublication? @relation("CurrentLegalPublication", fields: [currentPublicationId], references: [id], onDelete: Restrict)

  @@map("legal_settings")
}

model LegalPublication {
  id                String         @id @default(uuid())
  tenantId          String         @map("tenant_id")
  operatorName      String         @map("operator_name")
  contactAddress    String         @map("contact_address")
  privacyContact    String         @map("privacy_contact")
  contactPhone      String?        @map("contact_phone")
  contactEmail      String?        @map("contact_email")
  privacyVersion    String         @map("privacy_version")
  agreementVersion  String         @map("agreement_version")
  effectiveDate     DateTime       @map("effective_date") @db.Date
  privacyPolicyText String         @map("privacy_policy_text") @db.Text
  userAgreementText String         @map("user_agreement_text") @db.Text
  publishedAt       DateTime       @default(now()) @map("published_at")
  tenant            Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  currentFor        LegalSettings? @relation("CurrentLegalPublication")
  consents          LegalConsent[]

  @@unique([tenantId, privacyVersion, agreementVersion])
  @@index([tenantId, publishedAt])
  @@map("legal_publications")
}

model LegalConsent {
  id                   String           @id @default(uuid())
  tenantId             String           @map("tenant_id")
  userId               String           @map("user_id")
  publicationId        String           @map("publication_id")
  privacyVersion       String           @map("privacy_version")
  agreementVersion     String           @map("agreement_version")
  client               String           @default("miniapp")
  acceptedAt           DateTime         @default(now()) @map("accepted_at")
  tenant               Tenant           @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  user                 User             @relation(fields: [userId], references: [id], onDelete: Restrict)
  publication          LegalPublication @relation(fields: [publicationId], references: [id], onDelete: Restrict)

  @@unique([userId, publicationId, client])
  @@index([tenantId, userId, acceptedAt])
  @@map("legal_consents")
}
```

- [ ] **Step 4: Add the SQL migration with restrictive foreign keys**

Create `20260714100000_legal_publications_and_consents/migration.sql` with explicit `CREATE TABLE`, unique indexes, tenant/user/publication indexes, and `ON DELETE RESTRICT ON UPDATE CASCADE` foreign keys. Create `legal_settings` first without its publication foreign key, create `legal_publications` and `legal_consents`, then add `legal_settings_current_publication_id_fkey` after the publication table exists. Use PostgreSQL `DATE`, `TEXT`, `TIMESTAMP(3)`, and `gen_random_uuid()` consistently with existing migrations.

Add two deferrable constraint triggers, matching the repository's tenant-consistency migration style:

```sql
CREATE FUNCTION enforce_legal_current_publication_consistency() RETURNS trigger AS $$
BEGIN
  IF NEW.current_publication_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM legal_publications p
    WHERE p.id = NEW.current_publication_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_legal_current_publication' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_legal_current_publication
AFTER INSERT OR UPDATE OF tenant_id, current_publication_id ON legal_settings
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_legal_current_publication_consistency();

CREATE FUNCTION enforce_legal_consent_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users u
    JOIN legal_publications p ON p.id = NEW.publication_id
    WHERE u.id = NEW.user_id
      AND u.tenant_id = NEW.tenant_id
      AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_legal_consent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_legal_consent
AFTER INSERT OR UPDATE OF tenant_id, user_id, publication_id ON legal_consents
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_legal_consent_consistency();
```

- [ ] **Step 5: Add legal mapping functions**

In `legal.model.ts`, implement exact ISO mapping without returning Prisma rows directly:

```ts
export const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);
export const toPublicationSummary = (row: LegalPublicationRow): LegalPublicationSummary => ({
  id: row.id,
  privacyVersion: row.privacyVersion,
  agreementVersion: row.agreementVersion,
  effectiveDate: toDateOnly(row.effectiveDate),
  publishedAt: row.publishedAt.toISOString(),
});
export const toPublicLegal = (row: LegalPublicationRow): PublicLegalResponse => ({
  configured: true,
  tenantId: row.tenantId,
  publicationId: row.id,
  operatorName: row.operatorName,
  contactAddress: row.contactAddress,
  privacyContact: row.privacyContact,
  contactPhone: row.contactPhone,
  contactEmail: row.contactEmail,
  privacyVersion: row.privacyVersion,
  agreementVersion: row.agreementVersion,
  effectiveDate: toDateOnly(row.effectiveDate),
  privacyPolicyText: row.privacyPolicyText,
  userAgreementText: row.userAgreementText,
  publishedAt: row.publishedAt.toISOString(),
});
```

- [ ] **Step 6: Add credential-free AppID resolution**

In `IntegrationConfigService`, add:

```ts
async findEnabledWechatTenantId(appId: string): Promise<string | null> {
  const row = await this.prisma.integrationConfig.findFirst({
    where: { provider: 'wechat', appId, enabled: true },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}
```

Do not call `decrypt` and do not select `secretEnc` in this method.

- [ ] **Step 7: Implement legal draft, publication, public lookup, and consent methods**

In `legal.service.ts`:

```ts
type LegalDb = PrismaService | Prisma.TransactionClient;

async requireCurrentPublication(tenantId: string, publicationId: string, db: LegalDb = this.prisma) {
  const settings = await db.legalSettings.findUnique({
    where: { tenantId },
    select: { currentPublicationId: true },
  });
  if (!settings?.currentPublicationId) throw new ConflictException('当前机构尚未发布协议');
  if (settings.currentPublicationId !== publicationId) {
    throw new ConflictException('协议版本已更新，请重新阅读并同意');
  }
  const publication = await db.legalPublication.findFirst({
    where: { id: publicationId, tenantId },
  });
  if (!publication) throw new ConflictException('协议版本与当前机构不匹配');
  return publication;
}

async createConsent(db: LegalDb, input: { tenantId: string; userId: string; publication: LegalPublicationRow }) {
  await db.legalConsent.upsert({
    where: {
      userId_publicationId_client: {
        userId: input.userId,
        publicationId: input.publication.id,
        client: 'miniapp',
      },
    },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      publicationId: input.publication.id,
      privacyVersion: input.publication.privacyVersion,
      agreementVersion: input.publication.agreementVersion,
      client: 'miniapp',
    },
    update: {},
  });
}

async recordConsent(input: { tenantId: string; userId: string; publicationId: string }) {
  await this.prisma.$transaction(async tx => {
    const publication = await this.requireCurrentPublication(input.tenantId, input.publicationId, tx);
    await this.createConsent(tx, { ...input, publication });
  });
}
```

Also implement:

- `getSettings` with tenant-scoped draft and `currentPublication` selection;
- `saveDraft` as a complete `upsert` after Zod validation, converting `effectiveDate` to `new Date(`${date}T00:00:00.000Z`)`;
- `publish` as one transaction that reads the saved draft, creates an immutable snapshot, and updates only `currentPublicationId`;
- duplicate version-pair publication mapping to `ConflictException('协议版本号已发布，请更新版本号后重试')`;
- `getPublic` resolving tenant code and enabled AppID independently, rejecting unknown/mismatched results with `NotFoundException('未找到匹配的机构协议')`, and returning only the current publication or `{ configured: false, tenantId }`;
- `getPrivacyContact(tenantId)` selecting only the current publication's `privacyContact`, `contactPhone`, and `contactEmail`, returning their non-empty values joined with `，`, or `请联系机构管理员` when no current publication exists.

- [ ] **Step 8: Add controllers and module wiring**

`legal-settings.controller.ts` must be:

```ts
@Controller('legal-settings')
@Roles(Role.SYSTEM_ADMIN)
export class LegalSettingsController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) { return this.legal.getSettings(user); }

  @Put()
  save(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(legalDocumentPayloadSchema)) input: LegalDocumentPayload,
  ) { return this.legal.saveDraft(user, input); }

  @Post('publish')
  publish(@CurrentUser() user: AuthUser) { return this.legal.publish(user); }
}
```

`public-legal.controller.ts` must use `@Public()`, `@Throttle({ default: { ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 100_000 : 60 } })`, and `@Query(new ZodValidationPipe(publicLegalQuerySchema))` on `GET /public/legal`.

In `legal-settings.controller.spec.ts`, assert `Reflect.getMetadata(ROLES_KEY, LegalSettingsController)` equals `[Role.SYSTEM_ADMIN]` and verify the three controller methods pass the current `AuthUser` to `LegalService`. Export `LegalService` from `LegalModule`, import `IntegrationModule`, and add `LegalModule` once to `AppModule`.

- [ ] **Step 9: Generate Prisma client and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:generate
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/legal src/modules/integration/integration-config.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: focused tests and backend build pass.

- [ ] **Step 10: Apply the migration to the local PostGIS database**

Run with the existing local development database:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
```

Expected: migration `20260714100000_legal_publications_and_consents` applies successfully.

- [ ] **Step 11: Commit legal storage and APIs**

Run `git diff --check`, inspect the planned files, then commit:

```powershell
git add -- packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260714100000_legal_publications_and_consents/migration.sql packages/backend/src/modules/legal packages/backend/src/modules/integration/integration-config.service.ts packages/backend/src/modules/integration/integration-config.service.spec.ts packages/backend/src/app.module.ts
git commit -m "feat(backend): add tenant legal publications"
```

---

### Task 3: Record versioned consent through dedicated miniapp authentication routes

**Files:**
- Create: `packages/backend/src/auth/wechat-identity.service.ts`
- Create: `packages/backend/src/auth/wechat-identity.service.spec.ts`
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/src/auth/auth.service.spec.ts`
- Modify: `packages/backend/src/auth/auth.controller.ts`
- Modify: `packages/backend/src/auth/auth.controller.spec.ts`
- Modify: `packages/backend/src/auth/auth.module.ts`
- Create: `packages/backend/test/legal-miniapp-auth.e2e-spec.ts`

**Interfaces:**
- Produces `WechatIdentityService.resolve(appId, code): Promise<{ tenantId: string; openid: string }>`.
- Produces `AuthService.loginMiniapp`, `loginWechatMiniapp`, and `registerWechatMiniapp`.
- Produces public `POST /auth/miniapp/login`, `/auth/miniapp/wechat`, and `/auth/miniapp/wechat/register`.
- Keeps all generic and Web auth routes unchanged.

- [ ] **Step 1: Write failing auth tests**

Add controller tests proving each new route forwards the `publicationId`. Add service tests for:

```ts
it('records current consent before returning password-login tokens', async () => {
  const result = await service.loginMiniapp({
    tenantCode: 'DEMO', username: 'merchantA', password: 'password123', publicationId: publicationId,
  });
  expect(legal.recordConsent).toHaveBeenCalledWith({
    tenantId: 't1', userId: 'u1', publicationId,
  });
  expect(result.accessToken).toEqual(expect.any(String));
});

it('does not issue tokens when publication validation fails', async () => {
  legal.recordConsent.mockRejectedValue(new ConflictException('协议版本已更新，请重新阅读并同意'));
  await expect(service.loginMiniapp(input)).rejects.toBeInstanceOf(ConflictException);
  expect(jwt.signAsync).not.toHaveBeenCalled();
});

it('creates the pending WeChat user and consent in one transaction', async () => {
  await service.registerWechatMiniapp(registerInput);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(transaction.user.create).toHaveBeenCalledTimes(1);
  expect(legal.createConsent).toHaveBeenCalledWith(transaction, expect.objectContaining({
    tenantId: 't1', userId: 'newu',
  }));
});
```

- [ ] **Step 2: Run auth tests and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.controller.spec.ts src/auth/auth.service.spec.ts src/auth/wechat-identity.service.spec.ts
```

Expected: missing miniapp methods, controller routes, and identity service failures.

- [ ] **Step 3: Extract the reusable WeChat identity exchange**

Move the current `jscode2session` fetch, timeout, error mapping, and AppID-to-tenant lookup into `WechatIdentityService`. Its `resolve` method must:

```ts
async resolve(appId: string, code: string): Promise<{ tenantId: string; openid: string }> {
  const lookup = await this.integrations.findTenantByWechatAppId(appId);
  if (!lookup) throw new UnauthorizedException('该小程序未配置微信登录');
  const openid = await exchangeCode(appId, lookup.secret, code);
  return { tenantId: lookup.tenantId, openid };
}
```

Keep the existing `8_000 ms` abort timeout and existing safe messages. Update generic WeChat login, registration, and registration-status methods to use this service without changing their inputs or outputs.

- [ ] **Step 4: Refactor credential authentication away from token issuance**

Add private methods that return the authenticated user row:

```ts
private async authenticatePassword(dto: LoginDto) {
  const tenant = await this.prisma.tenant.findUnique({
    where: { code: dto.tenantCode },
    select: { id: true, status: true },
  });
  if (!tenant) throw new UnauthorizedException('账号或密码错误');
  const user = await this.prisma.user.findUnique({
    where: { tenantId_username: { tenantId: tenant.id, username: dto.username } },
  });
  if (!user || !await bcrypt.compare(dto.password, user.passwordHash)) {
    throw new UnauthorizedException('账号或密码错误');
  }
  if (!isKnownRole(user.role)) throw new UnauthorizedException('账号角色无效');
  if (user.status !== 'active') throw new ForbiddenException('账号待审核或已停用');
  if (tenant.status !== 'active') throw new ForbiddenException('所属机构已停用');
  await this.assertActiveAgent(user);
  return user;
}

private async authenticateWechat(dto: WechatLoginDto) {
  const identity = await this.wechat.resolve(dto.appId, dto.code);
  const user = await this.prisma.user.findUnique({
    where: {
      tenantId_wxOpenid: {
        tenantId: identity.tenantId,
        wxOpenid: identity.openid,
      },
    },
    include: { tenant: { select: { status: true } } },
  });
  if (!user) throw new NotFoundException('账号未注册');
  if (user.status !== 'active') throw new ForbiddenException('账号审核中');
  if (user.tenant.status !== 'active') throw new ForbiddenException('所属机构已停用');
  await this.assertActiveAgent(user);
  return user;
}
```

The generic methods become:

```ts
async login(dto: LoginDto): Promise<TokenPair> {
  return this.issueTokens(toAuthUser(await this.authenticatePassword(dto)));
}

async loginWechat(dto: WechatLoginDto): Promise<TokenPair> {
  return this.issueTokens(toAuthUser(await this.authenticateWechat(dto)));
}
```

- [ ] **Step 5: Add publication-aware miniapp authentication**

Implement:

```ts
async loginMiniapp(dto: MiniappLoginDto): Promise<TokenPair> {
  const user = await this.authenticatePassword(dto);
  await this.legal.recordConsent({
    tenantId: user.tenantId,
    userId: user.id,
    publicationId: dto.publicationId,
  });
  return this.issueTokens(toAuthUser(user));
}

async loginWechatMiniapp(dto: MiniappWechatLoginDto): Promise<TokenPair> {
  const user = await this.authenticateWechat(dto);
  await this.legal.recordConsent({
    tenantId: user.tenantId,
    userId: user.id,
    publicationId: dto.publicationId,
  });
  return this.issueTokens(toAuthUser(user));
}
```

For `registerWechatMiniapp`, resolve identity, reject duplicate `(tenantId, wxOpenid)`, ensure the default group, hash a random password, then use one Prisma transaction:

```ts
return this.prisma.$transaction(async tx => {
  const publication = await this.legal.requireCurrentPublication(
    identity.tenantId,
    dto.publicationId,
    tx,
  );
  const created = await tx.user.create({ data: pendingUserData, select: { id: true } });
  await this.legal.createConsent(tx, {
    tenantId: identity.tenantId,
    userId: created.id,
    publication,
  });
  return { applicationId: created.id, status: 'pending' as const };
});
```

- [ ] **Step 6: Add the three public controller routes**

Use the same credential throttle as the existing routes and Zod pipes for the new schemas:

```ts
@Public()
@Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
@Post('miniapp/login')
loginMiniapp(@Body(new ZodValidationPipe(miniappLoginSchema)) dto: MiniappLoginDto) {
  return this.auth.loginMiniapp(dto);
}
```

Repeat for `miniapp/wechat` and `miniapp/wechat/register`. Register and export `WechatIdentityService`, and import `LegalModule` in `AuthModule`; the later independent account-lifecycle module consumes only this exported identity verifier, not `AuthService` internals.

- [ ] **Step 7: Add database-backed consent E2E coverage**

Create `legal-miniapp-auth.e2e-spec.ts` that:

1. logs in as `sysadmin` through the existing generic route;
2. logs in as `merchantA` and verifies `GET`, `PUT`, and `POST /api/legal-settings*` return `403` with the merchant token;
3. saves and publishes a legal draft as `sysadmin`;
4. logs in `merchantA` through `/api/auth/miniapp/login` and verifies one `LegalConsent` row;
5. repeats login and verifies the row count remains one;
6. publishes a second version and verifies the first publication ID now returns `409`;
7. verifies generic `/api/auth/login` still succeeds without `publicationId`;
8. cleans rows in this order: legal consents, legal settings, then legal publications.

- [ ] **Step 8: Run focused tests and E2E**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.controller.spec.ts src/auth/auth.service.spec.ts src/auth/wechat-identity.service.spec.ts
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/legal-miniapp-auth.e2e-spec.ts
```

Expected: focused tests and the legal auth E2E pass.

- [ ] **Step 9: Commit miniapp consent authentication**

```powershell
git add -- packages/backend/src/auth packages/backend/test/legal-miniapp-auth.e2e-spec.ts
git commit -m "feat(backend): record miniapp legal consent"
```

---

### Task 4: Add the Web legal configuration and publication workspace

**Files:**
- Create: `packages/web/src/api/legal.ts`
- Create: `packages/web/src/api/legal.spec.ts`
- Create: `packages/web/src/components/LegalSettings.tsx`
- Create: `packages/web/src/components/LegalSettings.spec.tsx`
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/app-route.ts`
- Modify: `packages/web/src/app-route.spec.ts`
- Modify: `packages/web/src/components/AppWorkspaceViews.tsx`
- Modify: `packages/web/src/components/AppWorkspaceViews.lazy.spec.ts`

**Interfaces:**
- Produces Web API methods `getLegalSettings`, `saveLegalSettings`, and `publishLegalSettings` with shared-schema parsing.
- Adds system-admin-only tab `legalSettings` with stable route `#/app/legal-settings`.
- Produces a plain-text draft editor with explicit unsaved/saved/published states and confirmation before publication.

- [ ] **Step 1: Write failing API, navigation, and component tests**

The API test must assert exact paths and methods. The navigation tests must assert `system_admin` contains `legalSettings` while all other roles do not. The component test must cover:

```tsx
it('loads a draft, keeps the current publication visible, saves plain text, and confirms publish', async () => {
  render(<><LegalSettings /><DialogHost /></>);
  expect(await screen.findByDisplayValue('示例农业科技有限公司')).toBeTruthy();
  expect(screen.getByText('当前已发布：privacy-v1 / agreement-v1')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('隐私政策正文'), {
    target: { value: '<script>alert(1)</script>' + '隐私政策'.repeat(80) },
  });
  expect(document.querySelector('script')).toBeNull();
  expect((screen.getByRole('button', { name: '发布当前草稿' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
  await waitFor(() => expect(api.saveLegalSettings).toHaveBeenCalled());
  expect((screen.getByRole('button', { name: '发布当前草稿' }) as HTMLButtonElement).disabled).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: '发布当前草稿' }));
  expect(api.publishLegalSettings).not.toHaveBeenCalled();
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '确认发布' }));
  await waitFor(() => expect(api.publishLegalSettings).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run Web focused tests and verify RED**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/api/legal.spec.ts src/components/LegalSettings.spec.tsx src/navigation.spec.ts src/app-route.spec.ts src/components/AppWorkspaceViews.lazy.spec.ts
```

Expected: missing API/component/tab/route failures.

- [ ] **Step 3: Add the schema-parsed Web API module**

Implement:

```ts
export async function getLegalSettings(): Promise<LegalSettingsView> {
  return parseResponse(legalSettingsViewSchema, await request<unknown>('/legal-settings'), 'legal.get');
}
export async function saveLegalSettings(input: LegalDocumentPayload): Promise<LegalSettingsView> {
  return parseResponse(legalSettingsViewSchema, await request<unknown>('/legal-settings', {
    method: 'PUT', body: JSON.stringify(input),
  }), 'legal.save');
}
export async function publishLegalSettings(): Promise<LegalPublicationSummary> {
  return parseResponse(legalPublicationSummarySchema, await request<unknown>('/legal-settings/publish', {
    method: 'POST',
  }), 'legal.publish');
}
```

- [ ] **Step 4: Add route and lazy workspace wiring**

Add `legalSettings` to `AppTab`, map it to `legal-settings`, add a `FileText` system-navigation item labelled `法律与协议`, lazy import `LegalSettings`, and render its slot. Add `LegalSettings` to the lazy-boundary test list.

- [ ] **Step 5: Implement the legal editor state machine**

`LegalSettings.tsx` must:

- call `useApi(getLegalSettings, { cacheKey: 'legal-settings' })`;
- initialize the form from `data.draft` or exact empty strings/nulls;
- track `dirty`, `saving`, `publishing`, `error`, and success messages separately;
- validate with `legalDocumentPayloadSchema.safeParse` before saving;
- keep `data.currentPublication` visible while form fields change;
- disable publication when loading, dirty, missing draft, saving, or publishing;
- use `confirmDialog` with title `发布法律协议`, confirm label `确认发布`, and a message containing both version strings;
- render the two bodies only in `<textarea>` elements and never use `dangerouslySetInnerHTML`;
- use the existing Fluent helpers and `LoadingState`/`ErrorState`.

Use this status copy:

```tsx
{dirty ? '存在未保存更改' : data?.draft ? '草稿已保存' : '尚未配置草稿'}
{data?.currentPublication
  ? `当前已发布：${data.currentPublication.privacyVersion} / ${data.currentPublication.agreementVersion}`
  : '当前尚未发布，小程序登录与注册将保持禁用'}
```

- [ ] **Step 6: Run focused Web tests and verify GREEN**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/api/legal.spec.ts src/components/LegalSettings.spec.tsx src/navigation.spec.ts src/app-route.spec.ts src/components/AppWorkspaceViews.lazy.spec.ts
corepack pnpm@10.33.2 --filter web lint
```

Expected: focused tests and Web typecheck pass.

- [ ] **Step 7: Commit the Web legal workspace**

```powershell
git add -- packages/web/src/api/legal.ts packages/web/src/api/legal.spec.ts packages/web/src/components/LegalSettings.tsx packages/web/src/components/LegalSettings.spec.tsx packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/app-route.ts packages/web/src/app-route.spec.ts packages/web/src/components/AppWorkspaceViews.tsx packages/web/src/components/AppWorkspaceViews.lazy.spec.ts
git commit -m "feat(web): add legal publication settings"
```

---

### Task 5: Add miniapp legal loading, document pages, and fail-closed consent

**Files:**
- Create: `packages/miniapp/src/api/legal.ts`
- Create: `packages/miniapp/src/api/legal.spec.ts`
- Create: `packages/miniapp/src/components/LegalConsent/index.tsx`
- Create: `packages/miniapp/src/components/LegalConsent/index.scss`
- Create: `packages/miniapp/src/components/LegalConsent/model.ts`
- Create: `packages/miniapp/src/components/LegalConsent/model.spec.ts`
- Create: `packages/miniapp/src/pages/legal/index.tsx`
- Create: `packages/miniapp/src/pages/legal/index.scss`
- Create: `packages/miniapp/src/pages/legal/index.config.ts`
- Create: `packages/miniapp/src/pages/legal/workflow.spec.ts`
- Modify: `packages/miniapp/src/api/auth.ts`
- Modify: `packages/miniapp/src/api/auth.spec.ts`
- Modify: `packages/miniapp/src/pages/login/index.tsx`
- Modify: `packages/miniapp/src/pages/login/model.ts`
- Modify: `packages/miniapp/src/pages/login/model.spec.ts`
- Modify: `packages/miniapp/src/pages/login/workflow.spec.ts`
- Modify: `packages/miniapp/src/pages/register/index.tsx`
- Modify: `packages/miniapp/src/pages/register/workflow.spec.ts`
- Modify: `packages/miniapp/src/app.config.ts`

**Interfaces:**
- Produces `getPublicLegal({ tenantCode?, appId? })` and `buildLegalDocumentUrl`.
- Changes miniapp auth methods to require `publicationId` and call only `/auth/miniapp/*` routes.
- Produces one reusable pre-login legal document page and independent consent state in login and registration.

- [ ] **Step 1: Write failing legal/API/model tests**

Test the public API parsing, URL encoding, stable consent key, institution reset, and exact auth payloads:

```ts
expect(consentKey(configuredLegal)).toBe(`${configuredLegal.tenantId}:${configuredLegal.publicationId}`);
expect(shouldResetConsent(previousLegal, nextLegal)).toBe(true);
await auth.login('DEMO', 'merchantA', 'password123', publicationId);
expect(taro.request.mock.calls[0][0].url).toMatch(/\/auth\/miniapp\/login$/);
expect(taro.request.mock.calls[0][0].data).toEqual({
  tenantCode: 'DEMO', username: 'merchantA', password: 'password123', publicationId,
});
```

Update login and registration workflow source tests to require both `《用户协议》` and `《隐私政策》`, retry copy, publication version/effective date, and the absence of the old generic `隐私与授权说明` copy. Create `pages/legal/workflow.spec.ts` to require title/operator/version/effective-date/contact/error/retry rendering and to reject `dangerouslySetInnerHTML`.

- [ ] **Step 2: Run miniapp focused tests and verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/api/legal.spec.ts src/api/auth.spec.ts src/components/LegalConsent/model.spec.ts src/pages/legal/workflow.spec.ts src/pages/login/model.spec.ts src/pages/login/workflow.spec.ts src/pages/register/workflow.spec.ts
```

Expected: missing files and old route/payload assertions fail.

- [ ] **Step 3: Add the public legal API and pure consent helpers**

`api/legal.ts`:

```ts
export async function getPublicLegal(query: PublicLegalQuery): Promise<PublicLegalResponse> {
  const params = [
    query.tenantCode ? `tenantCode=${encodeURIComponent(query.tenantCode)}` : '',
    query.appId ? `appId=${encodeURIComponent(query.appId)}` : '',
  ].filter(Boolean).join('&');
  return parseResponse(publicLegalResponseSchema, await request<unknown>({
    url: `/public/legal?${params}`,
    auth: false,
  }), 'legal.public');
}
```

`components/LegalConsent/model.ts`:

```ts
export const consentKey = (legal: ConfiguredPublicLegal | null): string | null =>
  legal ? `${legal.tenantId}:${legal.publicationId}` : null;

export const shouldResetConsent = (
  previous: ConfiguredPublicLegal | null,
  next: ConfiguredPublicLegal | null,
): boolean => consentKey(previous) !== consentKey(next);

export function buildLegalDocumentUrl(
  kind: 'privacy' | 'agreement',
  query: PublicLegalQuery,
): string {
  const params = [`type=${encodeURIComponent(kind)}`];
  if (query.tenantCode) params.push(`tenantCode=${encodeURIComponent(query.tenantCode)}`);
  if (query.appId) params.push(`appId=${encodeURIComponent(query.appId)}`);
  return `/pages/legal/index?${params.join('&')}`;
}
```

- [ ] **Step 4: Implement the reusable consent component**

`LegalConsent` receives `legal`, `loading`, `error`, `checked`, `disabled`, `lookup`, `onChecked`, and `onRetry`. It renders:

- loading: `协议加载中，加载完成前不能登录或注册`;
- unconfigured: `协议尚未配置，请联系管理员`;
- error with a `重新加载协议` button;
- configured version copy `隐私政策 {privacyVersion} · 用户协议 {agreementVersion} · 生效 {effectiveDate}`;
- a checkbox and two independent `Button` controls navigating to the legal page;
- exact consent copy `我已阅读并同意《用户协议》和《隐私政策》`.

The checkbox is disabled whenever legal is unavailable, loading, errored, or the enclosing form is busy.

- [ ] **Step 5: Switch miniapp authentication to publication-aware routes**

Change signatures and paths:

```ts
login(tenantCode: string, username: string, password: string, publicationId: string)
loginWechat(publicationId: string)
registerWechat(displayName: string, publicationId: string, phone?: string)
```

Send `publicationId` in each request and use `/auth/miniapp/login`, `/auth/miniapp/wechat`, and `/auth/miniapp/wechat/register`. Keep registration-status lookup on its existing route because it neither creates an account nor issues a login session.

- [ ] **Step 6: Make login legal loading and consent fail closed**

On first render, load by `WX_APPID` when configured. On institution blur, normalize the code and reload using both `{ tenantCode, appId: WX_APPID }` when AppID exists. On every institution input change:

```ts
setAuthorized(false);
setLegal(null);
setLegalLookupCode(null);
setLegalError(null);
```

`canStartLogin` must require `authorized`, `publicationId`, no legal loading/error, and no auth request in progress. Password login must additionally require `legalLookupCode === normalized.tenantCode`. Pass `legal.publicationId` to the auth API. On a `409` publication conflict, clear authorization and reload legal before showing the message.

- [ ] **Step 7: Give registration its own independent consent state**

Registration loads only by `WX_APPID`, owns a separate `authorized` state, and passes its current publication ID to `registerWechat`. It must not read login-page checkbox storage or reuse a checked value after navigation. Disable `微信授权并提交` until legal is configured, checked, and not busy.

- [ ] **Step 8: Add the reusable legal document page**

Register `pages/legal/index` in `app.config.ts`. The page uses `useRouter()` to parse `type`, `tenantCode`, and `appId`, calls `getPublicLegal`, and renders:

- `隐私政策` or `用户协议` title;
- operator name;
- the relevant version and effective date;
- the relevant plain-text body in a `<Text userSelect>` element using `white-space: pre-wrap`;
- privacy contact and phone/email;
- explicit loading, error/retry, unconfigured, and invalid-document-type states.

Do not render HTML and do not require authentication.

- [ ] **Step 9: Run focused tests and build**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/api/legal.spec.ts src/api/auth.spec.ts src/components/LegalConsent/model.spec.ts src/pages/legal/workflow.spec.ts src/pages/login/model.spec.ts src/pages/login/workflow.spec.ts src/pages/register/workflow.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
```

Expected: focused tests and miniapp production build pass.

- [ ] **Step 10: Commit miniapp legal consent**

```powershell
git add -- packages/miniapp/src/api/legal.ts packages/miniapp/src/api/legal.spec.ts packages/miniapp/src/api/auth.ts packages/miniapp/src/api/auth.spec.ts packages/miniapp/src/components/LegalConsent packages/miniapp/src/pages/legal packages/miniapp/src/pages/login packages/miniapp/src/pages/register packages/miniapp/src/app.config.ts
git commit -m "feat(miniapp): require published legal consent"
```

---

### Task 6: Implement live personal-data preview and bounded JSON export

**Files:**
- Create: `packages/backend/src/modules/account-lifecycle/account-data.model.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-data.model.spec.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-data.service.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-data.service.spec.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-lifecycle.controller.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-lifecycle.controller.spec.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-lifecycle.module.ts`
- Modify: `packages/backend/src/app.module.ts`
- Create: `packages/backend/test/account-data.e2e-spec.ts`

**Interfaces:**
- Produces `AccountDataService.preview(actor): Promise<AccountDataPreview>`.
- Produces `AccountDataService.export(actor): Promise<{ fileName: string; body: Buffer }>`.
- Produces authenticated `GET /auth/me/data` and `GET /auth/me/data/export`.

- [ ] **Step 1: Write failing tenant/user-scope and export-limit tests**

The service tests must inspect every Prisma `where` clause and cover:

```ts
expect(prisma.field.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { tenantId: 't1', ownerId: 'u1' }, take: 20,
}));
expect(prisma.farmRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { tenantId: 't1', operatorId: 'u1' }, take: 20,
}));
expect(prisma.uploadAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { tenantId: 't1', userId: 'u1' }, take: 20,
}));
expect(prisma.creditOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { tenantId: 't1', buyerId: 'u1' }, take: 20,
}));
```

Also assert the output has no `passwordHash`, `wxOpenid`, `sessionVersion`, `objectKey`, `checksum`, `providerId`, `resultEnvelope`, `tradeNo`, or `idempotencyKey`. Add tests for a category count of `10_001` and a serialized body above `10 MiB`, both raising `PayloadTooLargeException` before a response is returned.

- [ ] **Step 2: Run focused account-data tests and verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/account-lifecycle/account-data.model.spec.ts src/modules/account-lifecycle/account-data.service.spec.ts src/modules/account-lifecycle/account-lifecycle.controller.spec.ts
```

Expected: missing service/model/controller failures.

- [ ] **Step 3: Add safe row mapping**

`account-data.model.ts` must map dates with `.toISOString()`, Prisma decimals with `Number(value)`, upload `sizeBytes` with `.toString()`, JSON image arrays only when `Array.isArray`, and must construct new objects containing only the shared schema fields. Define:

```ts
export const EXPORT_ROW_LIMIT = 10_000;
export const EXPORT_BYTE_LIMIT = 10 * 1024 * 1024;
export const PREVIEW_LIMIT = 20;
export const EXPORT_EXCLUSIONS = [
  '不包含密码、令牌、会话版本、微信 OpenID 和第三方密钥。',
  '不包含其他用户的个人资料、记录或上传内容。',
  '不包含 OSS 对象键、支付密钥、交易密钥和内部幂等标识。',
  '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
];
```

- [ ] **Step 4: Implement one authorization boundary for preview and export**

Use private query builders so preview and export cannot drift. Every category must use these predicates:

```ts
field: { tenantId: actor.tenantId, ownerId: actor.userId }
batch: { tenantId: actor.tenantId, ownerId: actor.userId }
farmRecord: { tenantId: actor.tenantId, operatorId: actor.userId }
supply: { tenantId: actor.tenantId, ownerId: actor.userId }
supplyIssue: { tenantId: actor.tenantId, ownerId: actor.userId }
uploadAsset: { tenantId: actor.tenantId, userId: actor.userId }
aiOperation: { tenantId: actor.tenantId, userId: actor.userId }
creditOrder: { tenantId: actor.tenantId, buyerId: actor.userId }
creditAccount: {
  tenantId_ownerType_ownerId: {
    tenantId: actor.tenantId,
    ownerType: 'MERCHANT',
    ownerId: actor.userId,
  },
}
```

The base account query selects safe profile fields plus `wxOpenid` only to derive `deletionVerification`; it never returns the OpenID. Tenant selection is `{ id, code, name }`.

Preview runs counts and latest-20 queries, sorts by `{ createdAt: 'desc' }`, and returns `recentLimit: 20`. Export first calculates all counts, rejects an over-limit category with a message naming that category and the configured privacy contact, then fetches complete collections using the same predicates. Credit ledgers are fetched only by the tenant-scoped account ID.

- [ ] **Step 5: Enforce final JSON size and construct the attachment**

```ts
const payload = accountDataExportSchema.parse({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  tenant,
  account,
  data,
  exclusions: EXPORT_EXCLUSIONS,
});
const json = JSON.stringify(payload, null, 2);
if (Buffer.byteLength(json, 'utf8') > EXPORT_BYTE_LIMIT) {
  throw new PayloadTooLargeException(exportLimitMessage(privacyContact));
}
return {
  fileName: `nongchang-account-data-${new Date().toISOString().slice(0, 10)}.json`,
  body: Buffer.from(json, 'utf8'),
};
```

Resolve `privacyContact` from the current legal publication; if unavailable, use `请联系机构管理员` without inventing a phone or email.

- [ ] **Step 6: Add account data controller endpoints**

Use `@Controller('auth/me')`. The export method must return a `StreamableFile` and set:

```ts
response.setHeader('Content-Type', 'application/json; charset=utf-8');
response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
response.setHeader('Content-Length', String(file.body.byteLength));
return new StreamableFile(file.body);
```

Create `AccountLifecycleModule` with `imports: [LegalModule]`, `controllers: [AccountLifecycleController]`, and `providers: [AccountDataService]`. Add `AccountLifecycleModule` once to `AppModule`; do not add these data/export providers to `AuthModule`.

- [ ] **Step 7: Add database-backed isolation E2E**

Create `account-data.e2e-spec.ts` with two tenants and two users. Seed one owned row per supported category for the target user and decoy rows for another user/tenant. Assert preview counts and recent arrays include only the target records. Assert export response headers, schema version, exclusion text, and absence of known secret/decoy markers. Clean rows in foreign-key order.

- [ ] **Step 8: Run tests and verify GREEN**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/account-lifecycle/account-data.model.spec.ts src/modules/account-lifecycle/account-data.service.spec.ts src/modules/account-lifecycle/account-lifecycle.controller.spec.ts
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/account-data.e2e-spec.ts
```

Expected: focused tests and isolation E2E pass.

- [ ] **Step 9: Commit live account data APIs**

```powershell
git add -- packages/backend/src/modules/account-lifecycle packages/backend/src/app.module.ts packages/backend/test/account-data.e2e-spec.ts
git commit -m "feat(backend): expose scoped account data export"
```

---

### Task 7: Add strong reauthentication and irreversible account anonymization

**Files:**
- Create: `packages/backend/src/modules/account-lifecycle/account-lifecycle.service.ts`
- Create: `packages/backend/src/modules/account-lifecycle/account-lifecycle.service.spec.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-lifecycle.controller.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-lifecycle.controller.spec.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-lifecycle.module.ts`
- Create: `packages/backend/test/account-closure.e2e-spec.ts`

**Interfaces:**
- Produces `AccountLifecycleService.close(actor, input): Promise<void>`.
- Produces authenticated `POST /auth/me/close` returning `204`.
- Consumes the safe `deletionVerification` profile boundary completed in Task 1.

- [ ] **Step 1: Write failing closure tests**

Add lifecycle tests for password success/failure, WeChat success/mismatch, method mismatch, administrator rejection, anonymization fields, retained identity fields, and cache invalidation. Keep the Task 1 profile tests unchanged as the verification-method contract.

The successful update assertion must be:

```ts
expect(transaction.user.updateMany).toHaveBeenCalledWith({
  where: {
    id: 'u1', tenantId: 't1', status: 'active', wxOpenid: null,
  },
  data: {
    status: 'deleted',
    username: 'deleted_u1',
    displayName: '已注销用户',
    phone: null,
    wxOpenid: null,
    groupId: null,
    passwordHash: expect.any(String),
    sessionVersion: { increment: 1 },
  },
});
expect(sessions.invalidateUser).toHaveBeenCalledWith('t1', 'u1');
```

Also assert `tenantId`, `role`, and `agentId` are not present in the update data.

- [ ] **Step 2: Run lifecycle tests and verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/account-lifecycle/account-lifecycle.service.spec.ts src/modules/account-lifecycle/account-lifecycle.controller.spec.ts
```

Expected: missing service/route/profile field failures.

- [ ] **Step 3: Reuse the safe verification method**

Use the Task 1 `MeProfileView.deletionVerification` contract in the miniapp. The backend lifecycle service still loads the current user directly and never trusts a client-supplied verification method. The existing safe mapper remains:

```ts
private toMeProfile(user: MeProfileRow): MeProfileView {
  return {
    id: user.id,
    tenantId: user.tenantId,
    username: user.username,
    role: user.role,
    agentId: user.agentId ?? null,
    displayName: user.displayName,
    phone: user.phone ?? null,
    status: user.status,
    deletionVerification: user.wxOpenid ? 'wechat' : 'password',
  };
}
```

- [ ] **Step 4: Implement eligibility and strong verification**

`AccountLifecycleService.close` first loads the current active user with `id + tenantId`, selecting `role`, `passwordHash`, and `wxOpenid`. Reject any role outside `merchant`/`member` with `ForbiddenException('管理员账号不能自助注销，请先完成职责移交')`.

Enforce method equality:

- stored OpenID present requires `method: 'wechat'`;
- stored OpenID absent requires `method: 'password'`.

Password uses `bcrypt.compare`. WeChat calls `WechatIdentityService.resolve(appId, code)` and requires both returned `tenantId === actor.tenantId` and `openid === user.wxOpenid`. All failures happen before mutation.

- [ ] **Step 5: Anonymize atomically and revoke sessions**

Hash `randomBytes(32).toString('hex')`, then execute a Prisma transaction with `updateMany` constrained by current identity and status. Require `count === 1`; otherwise throw `ConflictException('账号状态已变化，请重新登录后重试')`. After the transaction succeeds, `await sessions.invalidateUser(actor.tenantId, actor.userId)`.

The operation returns no body. Do not delete the user row or modify ownership foreign keys.

- [ ] **Step 6: Add the closure controller route**

Add to `AccountLifecycleController`:

```ts
@Post('close')
@HttpCode(HttpStatus.NO_CONTENT)
async close(
  @CurrentUser() user: AuthUser,
  @Body(new ZodValidationPipe(closeAccountSchema)) input: CloseAccountInput,
): Promise<void> {
  await this.lifecycle.close(user, input);
}
```

Update `AccountLifecycleModule` to import `AuthModule` and provide `AccountLifecycleService`. The dependency is one-way: `AuthModule` exports `WechatIdentityService`, while `AccountLifecycleModule` owns data export and account closure.

- [ ] **Step 7: Add account closure E2E proof**

Create a temporary password merchant with one owned field. Login through the generic route, close through `/api/auth/me/close`, then assert:

- response is `204`;
- user row has deleted status, replacement username/name, cleared phone/OpenID/group, and incremented session version;
- the owned field still references the same user ID;
- the old access token and refresh token both return `401` on later requests;
- a system-admin closure attempt returns `403` and does not mutate the user.

Delete the field before deleting the anonymized user during cleanup.

- [ ] **Step 8: Run tests and verify GREEN**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/account-lifecycle/account-lifecycle.service.spec.ts src/modules/account-lifecycle/account-lifecycle.controller.spec.ts
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/account-closure.e2e-spec.ts
```

Expected: focused tests and closure E2E pass.

- [ ] **Step 9: Commit secure account closure**

```powershell
git add -- packages/backend/src/modules/account-lifecycle packages/backend/test/account-closure.e2e-spec.ts
git commit -m "feat(backend): anonymize closed accounts"
```

---

### Task 8: Add miniapp “My Data”, export sharing, and account closure pages

**Files:**
- Create: `packages/miniapp/src/api/account.ts`
- Create: `packages/miniapp/src/api/account.spec.ts`
- Modify: `packages/miniapp/src/api/request.ts`
- Modify: `packages/miniapp/src/api/request.spec.ts`
- Create: `packages/miniapp/src/pages/account-data/index.tsx`
- Create: `packages/miniapp/src/pages/account-data/index.scss`
- Create: `packages/miniapp/src/pages/account-data/index.config.ts`
- Create: `packages/miniapp/src/pages/account-data/workflow.spec.ts`
- Create: `packages/miniapp/src/pages/close-account/index.tsx`
- Create: `packages/miniapp/src/pages/close-account/index.scss`
- Create: `packages/miniapp/src/pages/close-account/index.config.ts`
- Create: `packages/miniapp/src/pages/close-account/model.ts`
- Create: `packages/miniapp/src/pages/close-account/model.spec.ts`
- Create: `packages/miniapp/src/pages/close-account/workflow.spec.ts`
- Create: `packages/miniapp/src/pages/me/MeLegalAccountSection.tsx`
- Modify: `packages/miniapp/src/pages/me/index.tsx`
- Modify: `packages/miniapp/src/pages/me/index.scss`
- Modify: `packages/miniapp/src/pages/me/decomposition.spec.ts`
- Modify: `packages/miniapp/src/pages/me/truthfulness.spec.ts`
- Modify: `packages/miniapp/src/app.config.ts`
- Modify: `packages/miniapp/test/taro-mock.ts`
- Modify: `packages/miniapp/test/e2e/taro-runtime.ts`

**Interfaces:**
- Produces authenticated preview, file download/share, and closure API functions.
- Produces `pages/account-data/index` and `pages/close-account/index`.
- Keeps `pages/me/index.tsx` below `250` lines by extracting the legal/account menu.

- [ ] **Step 1: Write failing download, API, menu, and closure tests**

Add request tests proving authenticated download refreshes an expired token, retries once after `401`, and extracts a `413` JSON message from the downloaded temporary file. Add account API tests proving preview parsing, `Taro.saveFile`, `Taro.shareFileMessage`, fresh WeChat code acquisition, exact confirmation text, and local-token clearing only after `204`.

Add model tests:

```ts
expect(canSelfClose('merchant')).toBe(true);
expect(canSelfClose('member')).toBe(true);
expect(canSelfClose('system_admin')).toBe(false);
expect(buildCloseInput('password', { password: 'password123', appId: '', code: '' })).toEqual({
  method: 'password', currentPassword: 'password123', confirmation: '注销账号',
});
```

Create `account-data/workflow.spec.ts` to require live loading/error/retry, category counts, exclusions, export, and share actions. Create `close-account/workflow.spec.ts` to require the removed/retained explanations and prove no call to `closeMyAccount` occurs outside the success callback of the final `Taro.showModal` confirmation.

- [ ] **Step 2: Run focused miniapp tests and verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/api/request.spec.ts src/api/account.spec.ts src/pages/account-data/workflow.spec.ts src/pages/close-account/model.spec.ts src/pages/close-account/workflow.spec.ts src/pages/me/decomposition.spec.ts src/pages/me/truthfulness.spec.ts
```

Expected: missing download/account/page helpers and menu failures.

- [ ] **Step 3: Add authenticated file download with refresh parity**

Extend both Taro mocks with `downloadFile`, `saveFile`, `shareFileMessage`, `getFileSystemManager`, and `env.USER_DATA_PATH` support. In `request.ts`, add:

```ts
export async function downloadAuthenticated(url: string): Promise<string> {
  let token = await getUsableAccessToken();
  let result = await downloadWithToken(url, token);
  if (result.statusCode === 401) {
    if (!getRefreshToken()) expireSession();
    token = await refreshAccessToken();
    result = await downloadWithToken(url, token);
    if (result.statusCode === 401) expireSession();
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new RequestError(result.statusCode, readDownloadError(result));
  }
  return result.tempFilePath;
}
```

`readDownloadError` reads the temporary UTF-8 file with `Taro.getFileSystemManager().readFileSync`, parses Nest's `{ message }` JSON when possible, joins array messages, and otherwise returns `数据导出失败(${statusCode})`.

- [ ] **Step 4: Add account API methods**

`api/account.ts` must export:

```ts
export async function getMyData(): Promise<AccountDataPreview> {
  return parseResponse(accountDataPreviewSchema, await request<unknown>({
    url: '/auth/me/data',
  }), 'account.data');
}
export async function exportMyData(): Promise<string> {
  const tempFilePath = await downloadAuthenticated('/auth/me/data/export');
  const filePath = `${Taro.env.USER_DATA_PATH}/nongchang-account-data-${Date.now()}.json`;
  const saved = await Taro.saveFile({ tempFilePath, filePath });
  return saved.savedFilePath;
}
export async function shareMyData(filePath: string): Promise<void> {
  await Taro.shareFileMessage({ filePath, fileName: '农场账户数据副本.json' });
}
export async function closeMyAccount(input: CloseAccountInput): Promise<void> {
  await request<unknown>({ url: '/auth/me/close', method: 'POST', data: input });
  clearToken();
}
```

Add `closeMyWechatAccount` that calls `Taro.login()`, then delegates with `{ method: 'wechat', appId: WX_APPID, code, confirmation: '注销账号' }`.

- [ ] **Step 5: Add the live “My Data” page**

Register `pages/account-data/index`. On show, call `getMyData`. Render:

- account and tenant identity;
- one count card per category;
- latest records grouped by category with empty states;
- an exclusions section copied from the server contract;
- independent preview error/retry and export error/retry states;
- `导出 JSON 数据副本` and, after save, `分享数据副本` actions.

Do not claim uploaded binaries are exported. If export returns `413`, show the server message unchanged so the configured privacy contact remains visible.

- [ ] **Step 6: Add the dedicated irreversible closure page**

Register `pages/close-account/index`. Load `getMe()` to determine `deletionVerification`. Render exact retained/removed lists and a link to `我的数据`. Require the user to type `注销账号` before enabling the action.

For password mode, require current password. For WeChat mode, explain that a fresh WeChat verification will run. On action:

```ts
Taro.showModal({
  title: '最后确认注销账号',
  content: '注销后无法恢复，生产、溯源、审计、支付和财务记录仍会保留。是否继续？',
  confirmText: '确认注销',
  confirmColor: '#d13438',
  success: result => {
    if (!result.confirm) return;
    void performClosure();
  },
});
```

Only after `closeMyAccount` resolves: clear local tokens, show success, and redirect to login. On failure, keep tokens and form state unchanged.

- [ ] **Step 7: Extract and wire the Me legal/account menu**

`MeLegalAccountSection` receives the raw backend `roleCode`, `legalLookup`, and navigation callbacks. Add a separate `roleCode` state in `Me`; populate it from the decoded token and then from `getMe().role`, while keeping the existing localized `role` label for `MeProfileHeader`. The section renders `我的数据`, `隐私政策`, and `用户协议` for all logged-in roles. It renders `注销账号` only when `canSelfClose(roleCode)` is true. Remove the current Bluetooth-only `comingSoon` handler if it becomes unused. Keep `Me` below `250` lines.

- [ ] **Step 8: Run focused tests and miniapp E2E/build**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/api/request.spec.ts src/api/account.spec.ts src/pages/account-data/workflow.spec.ts src/pages/close-account/model.spec.ts src/pages/close-account/workflow.spec.ts src/pages/me/decomposition.spec.ts src/pages/me/truthfulness.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/miniapp test:e2e
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
```

Expected: focused tests, miniapp E2E, and production build pass.

- [ ] **Step 9: Commit miniapp data and closure UX**

```powershell
git add -- packages/miniapp/src/api/request.ts packages/miniapp/src/api/request.spec.ts packages/miniapp/src/api/account.ts packages/miniapp/src/api/account.spec.ts packages/miniapp/src/pages/account-data packages/miniapp/src/pages/close-account packages/miniapp/src/pages/me packages/miniapp/src/app.config.ts packages/miniapp/test/taro-mock.ts packages/miniapp/test/e2e/taro-runtime.ts
git commit -m "feat(miniapp): add data export and account closure"
```

---

### Task 9: Run complete verification and launch-readiness audit

**Files:**
- Verify only unless a test exposes a defect in the files introduced by Tasks 1-8.

**Interfaces:**
- Produces evidence for schema validation, migrations, authorization, consent idempotency, export limits, session revocation, Web legal settings, miniapp legal gating, and production builds.

- [ ] **Step 1: Run complete shared and backend gates**

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/shared test
corepack pnpm@10.33.2 --filter @nongchang/backend test
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e
```

Expected: every command exits zero.

- [ ] **Step 2: Run complete Web gates**

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: Web typecheck, tests, and production build pass.

- [ ] **Step 3: Run complete miniapp gates**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp test
corepack pnpm@10.33.2 --filter @nongchang/miniapp test:e2e
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
```

Expected: miniapp unit/E2E tests and WeChat production build pass.

- [ ] **Step 4: Run repository lint and production verification**

```powershell
corepack pnpm@10.33.2 lint
corepack pnpm@10.33.2 verify:production
```

Expected: repository lint and the full production gate exit zero.

- [ ] **Step 5: Audit schema and migration state**

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma migrate status
git diff --check
git status --short
git log -10 --oneline
```

Expected: database schema is up to date, `git diff --check` is clean, and the worktree contains no uncommitted changes.

- [ ] **Step 6: Record final evidence**

Report exact test counts and build results. Explicitly record:

- the publication IDs used in stale-consent E2E without printing document content unnecessarily;
- consent idempotency row count;
- export category and byte-limit proofs;
- cross-tenant decoy exclusion proof;
- retained foreign-key record after closure;
- old access/refresh token rejection after closure;
- Web legal settings role restriction;
- miniapp login/register disabled states when legal publication is unavailable;
- miniapp JSON file save/share proof.

Do not claim legal compliance certification or jurisdictional sufficiency; describe the implemented controls only.
