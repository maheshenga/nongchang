# P0 Text Integrity And SEO Regression Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove critical SaaS copy and metadata are stored as readable UTF-8 and prevent mojibake regressions.

**Architecture:** This P0 is a verification and regression-test slice. It does not change backend behavior, API contracts, routing, permissions, persistence, or visual layout. It adds focused tests around the most visible web surfaces: public metadata, navigation, login, billing, and farm records.

**Tech Stack:** React 19, Vite 6, Tailwind 4, Vitest, TypeScript, pnpm 10.33.2.

## Global Constraints

- No backend behavior changes.
- No UI redesign in this P0.
- Keep production source copy unchanged if UTF-8 evidence proves it is already readable.
- Limit scanning to current high-risk user-visible files, not historical docs or old plans.
- Treat PowerShell console mojibake as display-layer evidence only; verify file content through Node/Vitest UTF-8 reads.

---

## Execution Note

Node/Vitest UTF-8 reads proved the critical files already contain readable Chinese. The apparent mojibake from earlier inspection was a PowerShell display-encoding artifact. This P0 therefore ships regression tests only and does not rewrite production copy.

## File Map

- `packages/web/index.html`: public title, description, OG, Twitter, JSON-LD.
- `packages/web/src/seo-metadata.spec.ts`: asserts readable production title, description, and absence of common mojibake markers.
- `packages/web/src/text-integrity.spec.ts`: scans selected user-visible files for common mojibake markers.
- `packages/web/src/navigation.ts`: included in integrity scan.
- `packages/web/src/components/AppLogin.tsx`: included in integrity scan.
- `packages/web/src/components/BillingAdmin.tsx`: included in integrity scan.
- `packages/web/src/components/FarmRecords.tsx`: included in integrity scan.

## Task 1: Metadata Regression Test

**Files:**
- Modify: `packages/web/src/seo-metadata.spec.ts`

**Interfaces:**
- Consumes: `packages/web/index.html` as UTF-8 text.
- Produces: Vitest coverage for readable metadata and mojibake rejection.

- [x] **Step 1: Strengthen metadata assertions**

Assert the exact readable production title, readable description phrase, share metadata, JSON-LD, and absence of common mojibake markers.

- [x] **Step 2: Run focused test**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/seo-metadata.spec.ts
```

Observed: passed because the current source is already readable UTF-8.

## Task 2: Critical Source Integrity Test

**Files:**
- Create: `packages/web/src/text-integrity.spec.ts`

**Interfaces:**
- Consumes: selected source files via `readFileSync(..., 'utf8')`.
- Produces: a failing test if common mojibake markers appear in critical UI source.

- [x] **Step 1: Add selected-source scanner**

Scan:

```ts
[
  '../index.html',
  'navigation.ts',
  'components/AppLogin.tsx',
  'components/BillingAdmin.tsx',
  'components/FarmRecords.tsx',
]
```

Reject markers matching:

```ts
/\u9340|\u9422|\u7ec9|\u9a9e|\u93b4|\u8fe9|\u93c1|\u6d60|\u59af|\u8b81|\u837b|\uFFFD/
```

- [x] **Step 2: Run focused test**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/text-integrity.spec.ts
```

Observed: passed because the selected files are already stored as readable UTF-8.

## Task 3: Verification And Review

**Files:**
- `docs/superpowers/plans/2026-07-08-p0-text-integrity.md`
- `packages/web/src/seo-metadata.spec.ts`
- `packages/web/src/text-integrity.spec.ts`

- [x] **Step 1: Run focused web tests**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/seo-metadata.spec.ts src/text-integrity.spec.ts src/components/AppLogin.spec.tsx src/components/BillingAdmin.spec.tsx
```

Observed: passed, 43 files / 176 tests, because Vitest includes the configured web test suite around the requested paths.

- [x] **Step 2: Run web typecheck**

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Observed: passed.

- [x] **Step 3: Run diff whitespace check**

```powershell
git -c safe.directory=E:/code/nongchang diff --check
```

Observed: no whitespace errors; Git reported only line-ending normalization warnings.

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/plans/2026-07-08-p0-text-integrity.md packages/web/src/seo-metadata.spec.ts packages/web/src/text-integrity.spec.ts
git commit -m "test(web): guard critical text integrity"
```

## Self-Review

- Spec coverage: This addresses the critical text-integrity concern from the SaaS/UI audit with authoritative UTF-8 evidence and regression tests.
- Placeholder scan: No placeholder steps remain.
- Type consistency: No runtime interfaces or contracts changed.
