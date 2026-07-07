# SystemAdmin Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove misleading simulated production operations from `SystemAdmin` so the page no longer fabricates live server metrics, pending approvals, automatic archive prompts, or sensor alerts.

**Architecture:** Keep the fix inside `packages/web/src/components/SystemAdmin.tsx` and add a focused component/source regression test. Preserve the existing real `listAgents` and `createAgent` API behavior, but replace unbacked operational widgets with explicit demo/unavailable state copy or remove them from the rendered surface.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utility classes, lucide-react, local API wrappers.

## Global Constraints

- Do not change backend APIs, shared DTOs, role navigation, or auth behavior.
- Preserve real agent API wiring: `listAgents` and `createAgent` continue to be used for the agent list and create-agent modal.
- Remove or quarantine simulated production claims: no module-scope `Math.random()`, no auto-incrementing approval count, no timed archive prompt, and no timed warehouse sensor alarm.
- Do not display fake production claims as truth: avoid `SYSTEM ONLINE`, live CPU charts, fake blockchain node counts, fake API latency, fake daily notarization counts, fake active merchant counts, fake auto-archive prompts, and fake sensor alarms.
- If a capability lacks a backend source, display it as demo-only or pending backend integration instead of presenting a success/live status.
- Use TDD: write failing tests before production component changes and verify red/green steps.
- Because subagent tools are not exposed in this Codex session, execute inline while following the same task/review gates.

---

### Task 1: SystemAdmin Truthfulness Regression Coverage

**Files:**
- Create: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`
- Modify later: `packages/web/src/components/SystemAdmin.tsx`

**Interfaces:**
- Consumes: mocked `listAgents` and `createAgent` from `../api/agents`; `SystemAdmin` default component.
- Produces: Tests proving `SystemAdmin` no longer generates fake live data at import/render time and no longer renders fake live operational claims.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx` with tests that:
- Spy on `Math.random`, dynamically import `SystemAdmin`, render it, and assert `Math.random` was not called.
- Render `SystemAdmin` with an empty real agent list and assert the page does not show `SYSTEM ONLINE`, `CPU 负载`, `区块链节点状态`, `API 响应延迟`, `存证数据 (今日)`, `活跃商户通联`, `新的权限申请`, `自动归档`, `系统传感器警报`, or `冷库B区温度异常`.
- Assert the page does show an explicit unavailable/demo boundary such as `运营监控待接入` or `暂无实时运营监控数据`.

- [ ] **Step 2: Run tests to verify red**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.truthfulness.spec.tsx`

Expected: FAIL because current `SystemAdmin` evaluates `MOCK_SERVER_DATA` with `Math.random()` and renders fake live metrics/status/alerts.

---

### Task 2: Remove Simulated Live Operational Claims

**Files:**
- Modify: `packages/web/src/components/SystemAdmin.tsx`
- Test: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: existing `SystemAdmin` local state and real agent API wiring.
- Produces: A truthfulness-safe `SystemAdmin` render where unsupported monitoring/automation features are explicitly unavailable/demo-bounded.

- [ ] **Step 1: Remove fake live data generation**

Modify `packages/web/src/components/SystemAdmin.tsx` to:
- Remove `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, and `ResponsiveContainer` imports if they are only used by `MOCK_SERVER_DATA`.
- Delete `MOCK_SERVER_DATA`.
- Delete `unreadApprovals`, `archiveAlert`, `envAlarm`, and the `useEffect` that mutates them with timers.

- [ ] **Step 2: Replace fake monitoring hero and quick stats**

Modify the top monitoring section to render a neutral unavailable/demo boundary:
- Heading: `运营监控待接入`.
- Copy: `当前版本没有真实服务器监控、区块链节点、API 延迟、今日存证或活跃商户实时接口。`.
- Keep `DemoBadge` with a truthful note such as `监控能力未接入`.
- Replace the four fake metric cards with static capability-state rows that say `待接入` or `请接入真实监控 API` without numbers.

- [ ] **Step 3: Remove timed fake notifications and archive prompt**

Remove the rendered sections controlled by `unreadApprovals` and `archiveAlert`.

- [ ] **Step 4: Replace fake environment alarm state**

Modify the warehouse environment panel to:
- Stop using `envAlarm` to switch fake temperature values.
- Show an explicit message such as `暂无实时仓储环境数据`.
- Render any warehouse rows as pending integration state, not normal/abnormal sensor facts.

- [ ] **Step 5: Run tests to verify green**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.truthfulness.spec.tsx`

Expected: PASS.

---

### Task 3: Slice Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/SystemAdmin.tsx`
- Verify: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-08-p1-system-admin-truthfulness.md`

**Interfaces:**
- Consumes: The changed component and tests from Tasks 1-2.
- Produces: A reviewed commit on the current branch.

- [ ] **Step 1: Run focused tests**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.truthfulness.spec.tsx`

Expected: PASS.

- [ ] **Step 2: Run Web verification**

Run: `corepack pnpm@10.33.2 --filter web lint`

Expected: exit 0.

Run: `corepack pnpm@10.33.2 --filter web test`

Expected: all Web tests pass.

Run: `corepack pnpm@10.33.2 --filter web build`

Expected: Vite build exits 0. Existing `DashboardDemo` chunk-size warning may remain because this slice does not modify it.

- [ ] **Step 3: Scan simulated claim residue**

Run: `rg -n "MOCK_SERVER_DATA|Math\\.random|Simulate|simulate|unreadApprovals|archiveAlert|envAlarm|SYSTEM ONLINE|CPU 负载|区块链节点状态|API 响应延迟|存证数据 \(今日\)|活跃商户通联|新的权限申请|自动归档|系统传感器警报|冷库B区温度异常" packages/web/src/components/SystemAdmin.tsx`

Expected: no output.

- [ ] **Step 4: Review diff**

Run: `git -c safe.directory=E:/code/nongchang diff --check`

Expected: no whitespace errors.

Review checklist:
- Tests prove fake live generation no longer happens.
- Unsupported monitoring/automation capabilities are not shown as live production facts.
- Real agent list/create behavior is not removed.
- No backend contracts, route wiring, auth behavior, or DTOs changed.

- [ ] **Step 5: Commit**

Run:
```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-08-p1-system-admin-truthfulness.md packages/web/src/components/SystemAdmin.tsx packages/web/src/components/SystemAdmin.truthfulness.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "fix(web): remove simulated SystemAdmin operations"
```

Expected: commit created successfully.

## Self-Review

- Spec coverage: This plan targets the P1 truthfulness defect from the SaaS audit: simulated production metrics, alerts, and automation shown as real operations.
- Placeholder scan: No TBD/TODO/fill-later placeholders remain.
- Type consistency: The plan uses existing `SystemAdmin`, `listAgents`, and `createAgent` names visible in the current codebase.
- Scope check: This slice intentionally does not fully redesign `SystemAdmin` into Fluent. It removes the misleading simulated operations first; visual cleanup should remain a separate follow-up plan.
