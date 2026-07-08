# Miniapp Trace Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unimplemented blockchain/certificate claims from the miniapp trace page and replace them with copy that reflects the real batch and trace-event API data.

**Architecture:** Keep this as a miniapp-only copy and truthfulness slice. Do not change backend endpoints, shared DTOs, miniapp API wrappers, route configuration, tabBar behavior, poster generation flow, or trace timeline rendering. Add a source-level regression test because the existing miniapp test suite already uses lightweight Vitest checks for API and utility boundaries.

**Tech Stack:** Taro 4, React 18, TypeScript, Vitest, pnpm 10.33.2.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists.
- Use TDD: add the failing test first, verify RED, then change production code.
- Do not change `packages/miniapp/src/api/trace.ts`, `packages/miniapp/src/api/farm.ts`, backend modules, shared DTOs, or persistence behavior.
- The miniapp trace page must not claim blockchain, chain hashes, certificate status, or pending unimplemented capabilities.
- Preserve real behavior:
  - unauthenticated users still redirect to `/pages/login/index`.
  - `listBatches()` still loads batch chips.
  - `listTraceEvents(batchId)` still loads `TraceTimeline`.
  - `genPoster()` still uses the selected batch and event count.

---

## File Structure

- Create: `packages/miniapp/src/pages/trace/truthfulness.spec.ts`
  - Reads `pages/trace/index.tsx`.
  - Locks out visible overclaim tokens and requires real-data wording.
- Modify: `packages/miniapp/src/pages/trace/index.tsx`
  - Replace the blockchain placeholder panel with a real-record summary panel.
  - Rename poster title from certificate language to record language.
- Verify: `docs/superpowers/plans/2026-07-09-p1-miniapp-trace-truthfulness.md`

---

### Task 1: Add Miniapp Trace Truthfulness Regression Test

**Files:**
- Create: `packages/miniapp/src/pages/trace/truthfulness.spec.ts`

**Interfaces:**
- Consumes: source text from `src/pages/trace/index.tsx`.
- Produces: source-level guard against unimplemented public claims.

- [x] **Step 1: Write the failing test**

Create `packages/miniapp/src/pages/trace/truthfulness.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/pages/trace/index.tsx'), 'utf8');

describe('miniapp trace truthfulness boundary', () => {
  it('does not expose unimplemented blockchain or certificate claims', () => {
    const text = source();

    expect(text).not.toContain('区块链');
    expect(text).not.toContain('上链');
    expect(text).not.toContain('哈希');
    expect(text).not.toContain('存证');
    expect(text).not.toContain('待接入');
    expect(text).not.toContain('溯源证书');
  });

  it('describes the visible trace panel as real API-backed records', () => {
    const text = source();

    expect(text).toContain('当前公开记录');
    expect(text).toContain('来自真实接口');
    expect(text).toContain('溯源节点');
  });
});
```

- [x] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/trace/truthfulness.spec.ts
```

Expected: FAIL because `index.tsx` still contains `区块链存证数据`, `区块链接入中`, `上链哈希`, `待接入`, and `芍药溯源证书`.

---

### Task 2: Replace Blockchain Placeholder With Real Record Summary

**Files:**
- Modify: `packages/miniapp/src/pages/trace/index.tsx`
- Test: `packages/miniapp/src/pages/trace/truthfulness.spec.ts`

**Interfaces:**
- Consumes: existing `selected`, `events`, `batches`, and `TraceTimeline` rendering.
- Produces: truthful visible panel copy using only current batch and trace-event counts.

- [x] **Step 1: Rename poster title**

Change:

```tsx
ctx.fillText('芍药溯源证书', 20, 40);
```

To:

```tsx
ctx.fillText('芍药溯源记录', 20, 40);
```

- [x] **Step 2: Replace placeholder panel copy**

Replace the current `trace__chain` block:

```tsx
<View className="trace__chain">
  <View className="trace__chain-head">
    <Text className="trace__chain-title">区块链存证数据</Text>
    <Text className="trace__chain-badge">区块链接入中</Text>
  </View>
  <View className="trace__chain-grid">
    <Text className="trace__chain-row">上链哈希 0x····（接入中）</Text>
    <Text className="trace__chain-row">质检存证 待接入</Text>
    <Text className="trace__chain-row">封箱时间 待接入</Text>
  </View>
</View>
```

With:

```tsx
<View className="trace__chain">
  <View className="trace__chain-head">
    <Text className="trace__chain-title">当前公开记录</Text>
    <Text className="trace__chain-badge">来自真实接口</Text>
  </View>
  <View className="trace__chain-grid">
    <Text className="trace__chain-row">批次记录 {selected ? selected.batchNo : '未选择批次'}</Text>
    <Text className="trace__chain-row">溯源节点 {events.length} 个</Text>
    <Text className="trace__chain-row">记录状态 {events.length > 0 ? '已有公开节点' : '暂无公开节点'}</Text>
  </View>
</View>
```

- [x] **Step 3: Run focused test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/trace/truthfulness.spec.ts
```

Expected: PASS.

---

### Task 3: Verify, Review, and Commit P1

**Files:**
- Verify: `packages/miniapp/src/pages/trace/index.tsx`
- Verify: `packages/miniapp/src/pages/trace/truthfulness.spec.ts`
- Verify: `docs/superpowers/plans/2026-07-09-p1-miniapp-trace-truthfulness.md`

- [x] **Step 1: Run focused verification**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/pages/trace/truthfulness.spec.ts src/api/trace.spec.ts
```

Expected: PASS.

- [x] **Step 2: Run miniapp verification**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp test
```

Expected: all miniapp tests pass.

- [x] **Step 3: Run residue scan**

```powershell
rg -n "区块链|上链|哈希|存证|待接入|溯源证书" packages/miniapp/src/pages/trace/index.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: no source matches; no whitespace errors.

- [x] **Step 4: Request review**

Ask a reviewer to inspect the diff for:

- no backend/API/shared changes.
- no unimplemented blockchain/certificate claims remain.
- real listBatches/listTraceEvents/TraceTimeline/poster behavior is preserved.
- test covers the truthfulness boundary.

- [x] **Step 5: Commit**

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-miniapp-trace-truthfulness.md packages/miniapp/src/pages/trace/truthfulness.spec.ts packages/miniapp/src/pages/trace/index.tsx
git -c safe.directory=E:/code/nongchang commit -m "fix(miniapp): remove trace blockchain overclaims"
```

Expected: commit created successfully.

## Self-Review

Spec coverage: The plan covers the identified miniapp trace overclaim and preserves existing data/API flows.

Placeholder scan: No TBD/TODO/fill-later placeholders remain; every task has concrete file paths, commands, and expected outcomes.

Type consistency: The plan only uses existing `selected`, `events`, `listBatches`, `listTraceEvents`, and `TraceTimeline` names already present in `index.tsx`.
