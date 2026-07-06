# SaaS Audit Priority Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 15 prioritized SaaS audit findings in risk order, with one reviewed and verified commit per task.

**Architecture:** Keep fixes incremental and close to existing module boundaries. Frontend changes stay inside `packages/web/src` and shared UI helpers; backend changes stay inside Nest modules with Prisma-backed service tests. Security and data-reliability fixes are test-first and fail closed.

**Tech Stack:** React 19, Vite 6, Tailwind 4, NestJS 10, Prisma 5, Vitest, pnpm 10.33.2.

---

## Execution Rules

- Worktree: `E:/code/nongchang/.worktrees/saas-audit-priority-fixes`.
- Branch: `codex/saas-audit-priority-fixes`.
- Before each task: reread the relevant current code through CodeGraph or exact file snippets.
- TDD: write or update the focused failing test first, verify red, implement, verify green.
- Review: inspect `git diff`, run focused verification, then run broader verification when risk warrants it.
- Commit: one commit per completed task using a scoped message.

## Baseline Evidence

- `corepack pnpm@10.33.2 install` completed in the worktree.
- `corepack pnpm@10.33.2 test:unit` passed at baseline:
  - backend: 38 files, 400 tests passed
  - web: 36 files, 143 tests passed
  - miniapp: 12 files, 49 tests passed

## File Map

- `packages/web/index.html`: public metadata, title, OG, canonical, schema seed.
- `packages/web/src/App.tsx`: console shell, global search entry, notification state.
- `packages/web/src/navigation.ts`: role navigation data used by global menu search.
- `packages/web/src/components/GlobalSearch.tsx`: new command palette for task 6.
- `packages/web/src/components/BatchCredentialModal.tsx`: credential file upload UX.
- `packages/web/src/api/trace-credential.ts`: credential upload API client.
- `packages/backend/src/modules/upload/*`: upload validation, MIME policy, asset response.
- `packages/backend/src/modules/trace-credential/*`: credential URL trust boundary.
- `packages/backend/src/auth/jwt.strategy.ts`: live agent-status validation.
- `packages/backend/src/modules/agent/agent.service.ts`: session invalidation on agent suspension.
- `packages/backend/src/modules/public-trace/public-trace.service.ts`: scan hot path locking.
- `packages/backend/src/modules/tenant/*`, `agent/*`, `user/*`, `billing/*`: pagination cleanup.
- `packages/backend/src/main.ts`: Helmet CSP policy.
- `packages/backend/prisma/seed.ts`: demo seed guardrails.
- `packages/web/src/ui/*`: shared empty/error/loading states.

---

### Task 1: Public SEO And Marketing Metadata

**Files:**
- Modify: `packages/web/index.html`
- Test: add or update `packages/web/src/seo-metadata.spec.ts`

- [ ] **Step 1: Write failing test**

Create `packages/web/src/seo-metadata.spec.ts` that reads `index.html` and asserts:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

describe('public metadata', () => {
  it('uses production SaaS title and description instead of scaffold placeholders', () => {
    expect(html).toContain('<title>农业溯源 SaaS 平台');
    expect(html).toContain('name="description"');
    expect(html).not.toContain('My Google AI Studio App');
  });

  it('includes share and crawl metadata for the public shell', () => {
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('application/ld+json');
  });
});
```

- [ ] **Step 2: Verify red**

Run: `corepack pnpm@10.33.2 --filter web test -- src/seo-metadata.spec.ts`

Expected: fails because title and metadata are still missing.

- [ ] **Step 3: Implement metadata**

Update `packages/web/index.html` with production title, description, robots, theme color, OG, Twitter metadata, canonical URL placeholder using same-origin-safe `/`, and a minimal JSON-LD `SoftwareApplication` block.

- [ ] **Step 4: Verify green**

Run: `corepack pnpm@10.33.2 --filter web test -- src/seo-metadata.spec.ts`

Expected: pass.

- [ ] **Step 5: Review and commit**

Run: `git diff -- packages/web/index.html packages/web/src/seo-metadata.spec.ts`

Run: `corepack pnpm@10.33.2 --filter web build`

Commit: `fix(web): add production seo metadata`

---

### Task 2: Credential PDF Upload Contract

**Files:**
- Modify: `packages/backend/src/modules/upload/upload.service.ts`
- Modify: `packages/backend/src/modules/upload/upload.controller.ts`
- Modify: `packages/web/src/components/BatchCredentialModal.tsx`
- Test: `packages/backend/src/modules/upload/upload.service.spec.ts`

- [ ] **Step 1: Write failing backend test**

Add a test that calls `UploadService.upload()` with `{ mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('%PDF-1.7\n') }` and `{ purpose: 'credential' }`, expecting an uploaded URL ending in `.pdf`.

- [ ] **Step 2: Verify red**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/upload/upload.service.spec.ts`

Expected: fails because PDF is currently rejected.

- [ ] **Step 3: Implement purpose-aware validation**

Add upload purpose support:
- default `farm-record` accepts `image/jpeg`, `image/png`, `image/webp`
- `credential` accepts the same images plus `application/pdf`
- enforce existing 5 MB limit
- validate PDF magic prefix `%PDF-`

- [ ] **Step 4: Wire frontend request**

Update credential upload to call `/uploads?purpose=credential` while existing image uploads keep default behavior.

- [ ] **Step 5: Verify green**

Run backend upload spec and any credential upload client spec if added.

- [ ] **Step 6: Review and commit**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/upload/upload.service.spec.ts`

Commit: `fix(upload): support credential pdf uploads`

---

### Task 3: Credential File URL Trust Boundary

**Files:**
- Modify: `packages/backend/src/modules/trace-credential/trace-credential.service.ts`
- Modify: `packages/backend/src/modules/trace-credential/trace-credential.service.spec.ts`
- Optionally modify: `packages/backend/src/modules/upload/upload.service.ts`

- [ ] **Step 1: Write failing test**

Add a service test proving `create()` rejects `fileUrl: 'https://evil.example/report.pdf'` when trusted base URL is configured as `https://cdn.example.com`.

- [ ] **Step 2: Verify red**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace-credential/trace-credential.service.spec.ts`

Expected: fails because arbitrary URLs are accepted.

- [ ] **Step 3: Implement trust check**

Resolve trusted origins from tenant OSS `baseUrl` or `OSS_BASE_URL`; reject credential URLs outside those origins with `BadRequestException`.

- [ ] **Step 4: Verify green and commit**

Run focused trace credential spec.

Commit: `fix(trace): restrict credential file urls`

---

### Task 4: Agent Suspension Immediate Session Revocation

**Files:**
- Modify: `packages/backend/src/auth/jwt.strategy.ts`
- Modify: `packages/backend/src/auth/jwt.strategy.spec.ts`
- Modify: `packages/backend/src/modules/agent/agent.service.ts`
- Modify: `packages/backend/src/modules/agent/agent.service.spec.ts`

- [ ] **Step 1: Write failing JWT test**

Add a test that validates an `agent_admin` payload whose agent row is `suspended`; expect `UnauthorizedException`.

- [ ] **Step 2: Write failing agent service test**

Add a test that `setStatus(..., 'suspended')` increments `sessionVersion` for users assigned to the agent.

- [ ] **Step 3: Verify red**

Run focused auth and agent specs.

- [ ] **Step 4: Implement**

In `JwtStrategy.validate`, for `agent_admin` with `agentId`, query the same tenant's agent and reject missing/non-active. In `AgentService.setStatus`, when suspending, update related users with `sessionVersion: { increment: 1 }`.

- [ ] **Step 5: Verify and commit**

Run focused specs plus backend auth/agent related tests.

Commit: `fix(auth): revoke suspended agent sessions`

---

### Task 5: Public Trace Scan Hot Path

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`

- [ ] **Step 1: Write failing test**

Assert `getByCode()` no longer executes `SELECT id FROM batches ... FOR UPDATE` while still returning trace data and incrementing scan count.

- [ ] **Step 2: Verify red**

Run public trace service spec.

- [ ] **Step 3: Implement**

Remove batch row lock from read path; keep normal batch lookup and scan writes. Preserve frozen-code behavior.

- [ ] **Step 4: Verify and commit**

Run public trace and batch delete specs.

Commit: `perf(trace): avoid batch locks during public scans`

---

### Task 6: Functional Global Menu Search

**Files:**
- Create: `packages/web/src/components/GlobalSearch.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`

- [ ] **Step 1: Write failing test**

In `App.spec.tsx`, type a known nav label into the header search, expect a menu result button, click it, and assert active page heading changes.

- [ ] **Step 2: Verify red**

Run: `corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx`

- [ ] **Step 3: Implement**

Create a controlled search component over `flatNavItems`; show up to 8 results; Enter opens first result; Escape clears.

- [ ] **Step 4: Verify and commit**

Run focused App spec and web build.

Commit: `feat(web): add functional console search`

---

### Task 7: Pagination For Remaining Management Lists

**Files:**
- Modify: `packages/backend/src/modules/tenant/*`
- Modify: `packages/backend/src/modules/agent/*`
- Modify: `packages/backend/src/modules/user/*`
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
- Modify corresponding web API and components as needed.

- [ ] **Step 1: Add failing service/controller tests**

For each unbounded endpoint, assert `page/pageSize` returns a paginated envelope and default no-query remains backward compatible where current UI requires it.

- [ ] **Step 2: Implement pagination**

Apply existing `ListQuery` pattern; add caps where no envelope is used.

- [ ] **Step 3: Verify and commit**

Run backend affected specs and web affected specs.

Commit: `perf(api): paginate management lists`

---

### Task 8: Payment Result Polling

**Files:**
- Modify: `packages/web/src/components/PayResult.tsx`
- Modify: `packages/web/src/api/billing.ts`
- Test: add or update `packages/web/src/components/PayResult.spec.tsx`

- [ ] **Step 1: Write failing test**

Mock order API returning `PENDING` then `PAID`; assert UI transitions from processing to paid.

- [ ] **Step 2: Implement**

Poll for up to 60 seconds with bounded interval; show clear states.

- [ ] **Step 3: Verify and commit**

Run focused PayResult spec.

Commit: `fix(billing): poll payment result status`

---

### Task 9: Upload Magic Bytes And Image Safety

**Files:**
- Modify: `packages/backend/src/modules/upload/upload.service.ts`
- Modify: `packages/backend/src/modules/upload/upload.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add tests for fake PNG with wrong magic bytes and valid PNG/JPEG/WebP signatures.

- [ ] **Step 2: Implement**

Check magic bytes for JPEG, PNG, WebP, and PDF before OSS put.

- [ ] **Step 3: Verify and commit**

Run upload service spec.

Commit: `fix(upload): validate file signatures`

---

### Task 10: Helmet CSP Policy

**Files:**
- Modify: `packages/backend/src/main.ts`
- Add or update: `packages/backend/src/main.spec.ts` or config helper spec

- [ ] **Step 1: Extract CSP config with test**

Create a helper that returns Helmet options and test that CSP is enabled with explicit directives.

- [ ] **Step 2: Implement**

Use helper in `main.ts`, allowing self, data/blob images, configured OSS base URL, Tianditu, and Alipay form action.

- [ ] **Step 3: Verify and commit**

Run backend config tests.

Commit: `fix(security): enable scoped helmet csp`

---

### Task 11: Unavailable Capability Cleanup

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
- Modify: `packages/web/src/components/AiPlayground.tsx`
- Update existing specs.

- [ ] **Step 1: Write/adjust tests**

Assert unavailable controls either have product explanation or are removed from primary action clusters.

- [ ] **Step 2: Implement**

Move unavailable capabilities to secondary informational text, or remove from main toolbar where no workflow exists.

- [ ] **Step 3: Verify and commit**

Run affected web specs.

Commit: `fix(web): clarify unavailable capabilities`

---

### Task 12: Legacy Demo Bundle Hygiene

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: Vite config if manual chunks are needed.
- Update `packages/web/src/navigation.spec.ts`.

- [ ] **Step 1: Write failing test**

Assert legacy demo tabs are not exposed as production navigation state.

- [ ] **Step 2: Implement**

Separate demo-only imports from production console or remove dead legacy tab helpers.

- [ ] **Step 3: Verify and commit**

Run navigation spec and web build, compare chunk list.

Commit: `chore(web): isolate legacy demo surfaces`

---

### Task 13: Default Tenant Group Permissions

**Files:**
- Modify: `packages/backend/src/modules/tenant/tenant.service.ts`
- Modify: `packages/backend/src/modules/tenant/tenant.service.spec.ts`
- Optionally share constants with seed.

- [ ] **Step 1: Write failing test**

Create tenant and assert default user group includes the connected permissions: record create/view, field view, batch view, trace view.

- [ ] **Step 2: Implement**

Add a shared default permission constant and use it in tenant creation.

- [ ] **Step 3: Verify and commit**

Run tenant service spec.

Commit: `fix(tenant): seed default group permissions`

---

### Task 14: Shared Empty/Error/Loading States

**Files:**
- Create: `packages/web/src/ui/state.tsx`
- Modify selected high-traffic pages first: `TenantManagement`, `AgentManagement`, `MerchantManagement`, `BillingAdmin`.
- Add `packages/web/src/ui/state.spec.tsx`.

- [ ] **Step 1: Write component tests**

Assert empty, error with retry, and loading states render accessible labels.

- [ ] **Step 2: Implement shared components**

Create `EmptyState`, `ErrorState`, and `LoadingState` with Fluent styling.

- [ ] **Step 3: Adopt in selected pages**

Replace local duplicate state blocks.

- [ ] **Step 4: Verify and commit**

Run UI and affected component specs.

Commit: `refactor(web): standardize data states`

---

### Task 15: Production-Safe Seed Split

**Files:**
- Modify: `packages/backend/prisma/seed.ts`
- Modify: `packages/backend/package.json`
- Add: `packages/backend/prisma/seed.spec.ts` if helper functions are extracted.

- [ ] **Step 1: Write failing test or script guard check**

Assert demo seed refuses to run when `NODE_ENV=production` unless an explicit demo flag is present.

- [ ] **Step 2: Implement**

Split scripts into `prisma:seed:demo` and production-safe init command, or add a hard guard to existing seed.

- [ ] **Step 3: Verify and commit**

Run backend seed guard test and backend build.

Commit: `chore(seed): guard demo credentials in production`

---

## Final Verification

- [ ] Run `corepack pnpm@10.33.2 verify:local`.
- [ ] Run focused e2e only if backend contract changes touch auth, upload, payment, or trace public endpoints.
- [ ] Review `git log --oneline main..HEAD`.
- [ ] Prepare merge summary with risks and follow-up notes.
