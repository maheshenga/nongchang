# AI Assistant Fluent Trust Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the routed `AiAssistant` surface and its `AiDataQa` child into the Microsoft Fluent SaaS console system while adding regression coverage for real AI API behavior and no fake AI output.

**Architecture:** Keep this as a narrow Web UI and test slice. Reuse `packages/web/src/ui/fluent.ts` for controls and `packages/web/src/ui/state.tsx` for inline loading, empty, and error states, while preserving existing API wrappers.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utilities, lucide-react, existing local Fluent helpers.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists.
- Use TDD: add failing tests first, verify RED, then change production code.
- Do not change backend APIs, shared DTOs, billing behavior, AI credit semantics, upload behavior, or route/navigation wiring.
- Do not introduce new dependencies.
- Do not add fake AI answers, fake diagnosis, fake batch data, mock metrics, or local simulated AI results.
- Preserve all real API wrapper calls:
  - `aiChat(q)` for plant-protection chat.
  - `uploadImage(file)` before `aiDiagnose({ imageUrl, note? })`.
  - `aiDiagnose({ imageUrl: up.url })` for each batch file.
  - `aiAdvice({ batchId })` for batch advice.
  - `aiAsk({ question: q })` for data Q&A.
  - `listBatches()` for the advice batch selector.
- Touched production files must use `../ui/fluent` and must not contain dominant legacy tokens: `rounded-xl`, `rounded-2xl`, `bg-emerald-600`, `hover:bg-emerald-700`, `border-slate`, `text-slate`, `bg-slate`.

---

## File Structure

- Create: `packages/web/src/components/AiAssistant.spec.tsx`
  - Covers real chat, image upload before diagnosis, data Q&A, batch advice, and source-level Fluent/no-fake boundaries.
- Modify: `packages/web/src/components/AiAssistant.tsx`
  - Replace legacy card/color classes with Fluent helpers and accessible labels.
  - Keep API call semantics unchanged.
- Modify: `packages/web/src/components/AiDataQa.tsx`
  - Replace legacy card/color classes with Fluent helpers.
  - Keep `aiAsk({ question: q })` semantics unchanged.

---

### Task 1: Add AI Assistant Regression Tests

**Files:**
- Create: `packages/web/src/components/AiAssistant.spec.tsx`
- Modify later: `packages/web/src/components/AiAssistant.tsx`
- Modify later: `packages/web/src/components/AiDataQa.tsx`

**Interfaces:**
- Consumes mocked `../api/ai`, `../api/uploads`, and `../api/batches`.
- Produces regression coverage for API calls, result rendering, error rendering, and source-level UI/truthfulness boundaries.

- [x] **Step 1: Write the failing tests**

Test behaviors:

```tsx
expect(text).toContain("from '../ui/fluent'");
expect(text).not.toContain('rounded-xl');
expect(text).not.toContain('bg-emerald-600');
expect(text).not.toContain('mockResult');
```

```tsx
fireEvent.change(screen.getByPlaceholderText('例如：芍药叶片出现褐色斑点，如何防治？'), {
  target: { value: '  白粉病怎么防治  ' },
});
fireEvent.click(screen.getByRole('button', { name: '提问' }));
await waitFor(() => expect(aiMocks.aiChat).toHaveBeenCalledWith('白粉病怎么防治'));
```

```tsx
fireEvent.change(screen.getByLabelText('选择诊断图片'), { target: { files: [file] } });
await waitFor(() => expect(uploadMocks.uploadImage).toHaveBeenCalledWith(file));
fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
await waitFor(() => expect(aiMocks.aiDiagnose).toHaveBeenCalledWith({
  imageUrl: 'https://oss.example.test/leaf.jpg',
  note: '叶背有白色粉末',
}));
```

- [x] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AiAssistant.spec.tsx
```

Expected RED: FAIL because `AiAssistant.tsx` and `AiDataQa.tsx` lack Fluent imports, still contain legacy class tokens, and do not expose the required accessible labels.

---

### Task 2: Refactor AiDataQa to Fluent

**Files:**
- Modify: `packages/web/src/components/AiDataQa.tsx`
- Test: `packages/web/src/components/AiAssistant.spec.tsx`

**Interfaces:**
- Consumes: `aiAsk({ question: q })`.
- Produces: A Fluent-styled data Q&A card with accessible textarea and `查询数据` command.

- [x] **Step 1: Import Fluent helpers and state helpers**

```tsx
import { fluentButton, fluentInput } from '../ui/fluent';
import { ErrorState } from '../ui/state';
```

- [x] **Step 2: Replace the section shell and controls**

```tsx
<section className="border border-[#E1DFDD] bg-white p-5">
<textarea className={`${fluentInput} h-auto min-h-24 w-full resize-none py-2`} />
<button type="button" className={fluentButton('primary')}>查询数据</button>
```

- [x] **Step 3: Preserve behavior**

```tsx
const q = question.trim();
if (!q) return;
const res = await aiAsk({ question: q });
setAnswer(res.answer);
```

---

### Task 3: Refactor AiAssistant to Fluent Without Changing AI Calls

**Files:**
- Modify: `packages/web/src/components/AiAssistant.tsx`
- Test: `packages/web/src/components/AiAssistant.spec.tsx`

**Interfaces:**
- Consumes: `aiChat`, `aiDiagnose`, `aiAdvice`, `uploadImage`, `listBatches`, and `AiDataQa`.
- Produces: A Fluent-styled AI assistant page with readable states and stable labels.

- [x] **Step 1: Import Fluent helpers and state helpers**

```tsx
import { fluentButton, fluentInput, fluentSelect } from '../ui/fluent';
import { EmptyState, ErrorState } from '../ui/state';
```

- [x] **Step 2: Add accessible labels for file inputs and selectors**

```tsx
<input aria-label="选择诊断图片" type="file" accept="image/jpeg,image/png,image/webp" />
<input aria-label="选择批量诊断图片" type="file" multiple accept="image/jpeg,image/png,image/webp" />
<select aria-label="选择建议批次" className={`${fluentSelect} w-full`} />
```

- [x] **Step 3: Preserve exact call semantics**

```tsx
const res = await aiChat(q);
const res = await aiDiagnose({ imageUrl, note: note.trim() || undefined });
const up = await uploadImage(file);
const res = await aiDiagnose({ imageUrl: up.url });
const res = await aiAdvice({ batchId: adviceBatchId });
listBatches().then(setBatches).catch(() => setBatches([]));
```

- [x] **Step 4: Run focused test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AiAssistant.spec.tsx src/components/AiPlayground.spec.tsx
```

Expected: PASS.

---

### Task 4: Verify, Review, and Commit P1

**Files:**
- Verify: `packages/web/src/components/AiAssistant.tsx`
- Verify: `packages/web/src/components/AiDataQa.tsx`
- Verify: `packages/web/src/components/AiAssistant.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-ai-assistant-fluent-trust-boundary.md`

- [x] **Step 1: Run Web verification**

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: lint exits 0; all Web tests pass; build exits 0. Existing `DashboardDemo` chunk-size warning may remain.

- [x] **Step 2: Run residue scan**

```powershell
rg -n "rounded-xl|rounded-2xl|bg-emerald-600|hover:bg-emerald-700|border-slate|text-slate|bg-slate|mockResult|Simulate AI|setTimeout\(\(\) =>" packages/web/src/components/AiAssistant.tsx packages/web/src/components/AiDataQa.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: no residue matches; no whitespace errors.

- [x] **Step 3: Request review**

Ask a reviewer to inspect the diff for:

- No API contract changes.
- No fake AI output paths.
- Existing AI wrapper calls preserved.
- Fluent styling applied to both components.
- Tests cover chat, diagnosis, data Q&A, advice, and source boundary.

- [ ] **Step 4: Commit**

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-ai-assistant-fluent-trust-boundary.md packages/web/src/components/AiAssistant.spec.tsx packages/web/src/components/AiAssistant.tsx packages/web/src/components/AiDataQa.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align AI assistant with Fluent UI"
```

Expected: commit created successfully.

## Self-Review

Spec coverage: This plan addresses the next visible routed P1 surface from the SaaS completion audit: `AiAssistant` and `AiDataQa` are reachable from role navigation, currently use legacy visual tokens, and lack component coverage.

Placeholder scan: No TBD/TODO/fill-later placeholders remain; each task names exact files, commands, expected outcomes, and API invariants.

Type consistency: API names match `packages/web/src/api/ai.ts`, `packages/web/src/api/uploads.ts`, and `packages/web/src/api/batches.ts`. Fluent helper names match `packages/web/src/ui/fluent.ts`.
