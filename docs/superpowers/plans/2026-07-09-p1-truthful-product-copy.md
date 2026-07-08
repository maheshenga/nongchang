# P1 Truthful Product Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production-visible blockchain/storage-overclaim copy from the miniapp and Web entry surfaces so the SaaS only promises capabilities that are currently true.

**Architecture:** This is a copy-integrity slice with no API, schema, or routing changes. The implementation adds source-level truthfulness tests around the touched files, then replaces misleading blockchain/storage wording with accurate traceability, location, and document-management wording.

**Tech Stack:** React, Taro, Vite/Vitest, static source assertions, pnpm 10.33.2.

## Global Constraints

- Use CodeGraph before file-level discovery in this indexed repository.
- Use TDD: write failing tests before production edits and verify the tests fail for the expected reason.
- Do not change backend APIs, database schema, routes, auth, or role navigation in this slice.
- Do not remove genuine "DemoBadge" or test/mock terminology from test files; only production-visible source copy is in scope.
- Keep replacements truthful: allowed wording includes "地块定位", "位置记录", "溯源记录", "资质文件管理", and "资料留档"; disallowed wording includes "区块链", "上链", "哈希", "存证" on the touched production surfaces.
- Use `corepack pnpm@10.33.2 ...` for package commands.

---

## File Structure

- Create `packages/miniapp/src/pages/work/components/truthfulness.spec.ts`
  - Source-level guard for `WorkQuickActions.tsx`.
  - Asserts the page no longer exposes blockchain positioning claims and does expose truthful location copy.
- Create `packages/miniapp/src/pages/me/truthfulness.spec.ts`
  - Source-level guard for `pages/me/index.tsx`.
  - Asserts the account center no longer exposes blockchain evidence/deposit claims and uses traceability/data-record wording.
- Create `packages/web/src/components/AppLogin.truthfulness.spec.ts`
  - Source-level guard for `AppLogin.tsx`.
  - Asserts login marketing copy does not promise storage/deposit/blockchain capabilities.
- Create `packages/web/src/seo.truthfulness.spec.ts`
  - Source-level guard for `packages/web/index.html`.
  - Asserts SEO/OG/schema copy does not contain the overclaiming storage/deposit wording.
- Modify `packages/miniapp/src/pages/work/components/WorkQuickActions.tsx`
  - Replace "区块链定位" with "地块定位".
  - Replace "区块链定位即将开放" with "位置记录请在农事表单中保存".
- Modify `packages/miniapp/src/pages/me/index.tsx`
  - Replace "区块链存证" with "溯源记录".
  - Keep the item reserved only if it is still a future deeper record center; do not imply blockchain.
- Modify `packages/web/src/components/AppLogin.tsx`
  - Replace "全链路数据存证" with "全链路资料留档" or equivalent truthful wording.
- Modify `packages/web/index.html`
  - Replace title, description, OG, Twitter, and schema "存证" wording with "资质文件管理" / "资料留档".

---

### Task 1: Miniapp Work Quick Actions Truthfulness

**Files:**
- Create: `packages/miniapp/src/pages/work/components/truthfulness.spec.ts`
- Modify: `packages/miniapp/src/pages/work/components/WorkQuickActions.tsx`

**Interfaces:**
- Consumes: `WorkQuickActions.tsx` source text.
- Produces: A source invariant that this quick-action surface does not contain "区块链", "上链", "哈希", or "存证" and contains "地块定位".

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'WorkQuickActions.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('WorkQuickActions truthful copy', () => {
  it('does not describe the reserved location action as blockchain capability', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('地块定位');
    expect(source).toContain('位置记录请在农事表单中保存');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/work/components/truthfulness.spec.ts`

Expected: FAIL because current source contains `区块链定位` and `区块链定位即将开放`.

- [x] **Step 3: Write minimal implementation**

In `WorkQuickActions.tsx`, replace the reserved quick action block with:

```tsx
<View className="work__quick-item work__quick-item--reserved" onClick={() => Taro.showToast({ title: '位置记录请在农事表单中保存', icon: 'none' })}>
  <Icon name="trace" color="#94a3b8" size={28} />
  <Text className="work__quick-text">地块定位</Text>
</View>
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/work/components/truthfulness.spec.ts`

Expected: PASS.

---

### Task 2: Miniapp Account Center Truthfulness

**Files:**
- Create: `packages/miniapp/src/pages/me/truthfulness.spec.ts`
- Modify: `packages/miniapp/src/pages/me/index.tsx`

**Interfaces:**
- Consumes: `pages/me/index.tsx` source text.
- Produces: A source invariant that the account center no longer advertises blockchain evidence/storage copy.

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'index.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('Me page truthful copy', () => {
  it('uses traceability record copy instead of blockchain storage claims', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('溯源记录');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/me/truthfulness.spec.ts`

Expected: FAIL because current source contains `区块链存证`.

- [x] **Step 3: Write minimal implementation**

In `packages/miniapp/src/pages/me/index.tsx`, replace the menu item label:

```tsx
<Text className="me__item-text">溯源记录</Text>
```

Keep the existing badge if the route is still reserved; the badge must not mention blockchain.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/me/truthfulness.spec.ts`

Expected: PASS.

---

### Task 3: Web Login Marketing Copy Truthfulness

**Files:**
- Create: `packages/web/src/components/AppLogin.truthfulness.spec.ts`
- Modify: `packages/web/src/components/AppLogin.tsx`

**Interfaces:**
- Consumes: `AppLogin.tsx` source text.
- Produces: A source invariant that the login page does not promise storage/deposit/blockchain capability.

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'AppLogin.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('AppLogin truthful marketing copy', () => {
  it('does not promise unimplemented storage or blockchain trust capabilities', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('全链路资料留档');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter web test -- src/components/AppLogin.truthfulness.spec.ts`

Expected: FAIL because current source contains `全链路数据存证`.

- [x] **Step 3: Write minimal implementation**

In `AppLogin.tsx`, replace the desktop and mobile supporting copy with truthful wording:

```tsx
<p className="mt-4 max-w-md text-sm leading-6 text-[#605E5C]">全链路资料留档与数字农业协作，面向租户、代理商与商户的统一管理入口。</p>
```

```tsx
<p className="mt-2 text-sm text-[#605E5C]">全链路资料留档与数字农业协作</p>
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.33.2 --filter web test -- src/components/AppLogin.truthfulness.spec.ts`

Expected: PASS.

---

### Task 4: Web SEO Copy Truthfulness

**Files:**
- Create: `packages/web/src/seo.truthfulness.spec.ts`
- Modify: `packages/web/index.html`

**Interfaces:**
- Consumes: `packages/web/index.html` source text.
- Produces: A source invariant that public metadata does not contain blockchain/storage-overclaim copy.

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(webRoot, 'index.html'), 'utf8');

describe('SEO truthful copy', () => {
  it('does not advertise storage/deposit or blockchain capabilities in metadata', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('资质文件管理');
    expect(source).toContain('资料留档');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter web test -- src/seo.truthfulness.spec.ts`

Expected: FAIL because current metadata contains `资质存证`.

- [x] **Step 3: Write minimal implementation**

In `packages/web/index.html`, replace:

- `资质存证` with `资质文件管理`
- `资质检测报告存证` with `资质检测报告管理`
- `资质报告管理` remains allowed
- One metadata description should contain `资料留档`

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.33.2 --filter web test -- src/seo.truthfulness.spec.ts`

Expected: PASS.

---

### Task 5: Slice Verification and Commit

**Files:**
- Verify all files touched in Tasks 1-4.

**Interfaces:**
- Consumes: all new tests and modified source files.
- Produces: one reviewed commit for the P1 truthfulness slice.

- [x] **Step 1: Run miniapp related tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/miniapp test`

Expected: all miniapp tests PASS.

- [x] **Step 2: Run web related tests**

Run: `corepack pnpm@10.33.2 --filter web test -- src/components/AppLogin.truthfulness.spec.ts src/seo.truthfulness.spec.ts`

Expected: both web truthfulness specs PASS.

- [x] **Step 3: Run residue scan for touched production surfaces**

Run: `rg -n "区块链|上链|哈希|存证" packages/miniapp/src/pages/work/components/WorkQuickActions.tsx packages/miniapp/src/pages/me/index.tsx packages/web/src/components/AppLogin.tsx packages/web/index.html`

Expected: no matches.

- [x] **Step 4: Run diff check**

Run: `git -c safe.directory=E:/code/nongchang diff --check`

Expected: no whitespace errors.

- [x] **Step 5: Review diff**

Run: `git -c safe.directory=E:/code/nongchang diff -- packages/miniapp/src/pages/work/components/WorkQuickActions.tsx packages/miniapp/src/pages/work/components/truthfulness.spec.ts packages/miniapp/src/pages/me/index.tsx packages/miniapp/src/pages/me/truthfulness.spec.ts packages/web/src/components/AppLogin.tsx packages/web/src/components/AppLogin.truthfulness.spec.ts packages/web/index.html packages/web/src/seo.truthfulness.spec.ts`

Expected: diff only contains the tests and truthful copy replacements described above.

- [x] **Step 6: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add packages/miniapp/src/pages/work/components/WorkQuickActions.tsx packages/miniapp/src/pages/work/components/truthfulness.spec.ts packages/miniapp/src/pages/me/index.tsx packages/miniapp/src/pages/me/truthfulness.spec.ts packages/web/src/components/AppLogin.tsx packages/web/src/components/AppLogin.truthfulness.spec.ts packages/web/index.html packages/web/src/seo.truthfulness.spec.ts docs/superpowers/plans/2026-07-09-p1-truthful-product-copy.md
git -c safe.directory=E:/code/nongchang commit -m "fix: remove production copy overclaims"
```

Expected: commit succeeds.

---

## Self-Review

**Spec coverage:** The plan covers the current P1 truthfulness risks identified in production-visible miniapp and Web entry/SEO copy. It intentionally excludes broader Fluent UI refactors, dashboard demo cleanup, URL routing, and backend work; those are separate P1/P2 slices.

**Placeholder scan:** No `TBD`, `TODO`, `implement later`, or unspecified test steps remain.

**Type consistency:** Tests are source-level Vitest specs and do not introduce runtime component interfaces. Production edits are copy-only.
