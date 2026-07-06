# Trace Label Truthfulness P2D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining production-surface truthfulness gap in the merchant trace-code label workflow by removing visible claims that are not backed by real backend data.

**Architecture:** Keep the real trace-code generation API path unchanged. The web component should still generate real codes with `Idempotency-Key`, but all preview/print text must describe only what the system actually knows: batch, crop, generated trace code, and public trace lookup. Remove or disable local-only template/config controls that imply unpublished backend behavior.

**Tech Stack:** React, Vitest, Testing Library, existing `packages/web/src/components/MerchantAdmin.tsx` and `MerchantAdmin.actions.spec.tsx`.

---

## File Structure

- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
  - Add a regression test that opens the real print-preview flow and rejects unsupported claims such as quality certification, zero-knowledge proof, OAuth proof, geolocation injection, and local-only custom label fields.
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
  - Remove the unreachable H5 template editor state and modal.
  - Remove local-only label custom fields that are not sent to the backend.
  - Replace fake side-panel sample wording with a neutral generated-code preview.
  - Replace the print-preview label with truthful, backend-backed batch and trace-code fields.

## Task 1: Add Failing Truthfulness Regression

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`

- [ ] **Step 1: Write the failing test**

Add this test inside `describe('MerchantAdmin production actions', () => { ... })`:

```tsx
  it('prints trace labels without unsupported certification or cryptographic claims', async () => {
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByText('Peony'));
    fireEvent.click(screen.getByRole('button', { name: /打印追溯标签/ }));

    await screen.findByRole('dialog', { name: '溯源码标签打印预览' });

    expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 1, expect.any(String));
    expect(container.textContent).toContain('TRACE-001');
    expect(container.textContent).toContain('扫码查看该批次已登记的溯源信息');
    expect(container.textContent).not.toContain('权威质检');
    expect(container.textContent).not.toContain('PASSED');
    expect(container.textContent).not.toContain('zero-knowledge');
    expect(container.textContent).not.toContain('OAUTH');
    expect(container.textContent).not.toContain('地理标志');
    expect(container.textContent).not.toContain('源头温室棚室标识');
    expect(container.textContent).not.toContain('花卉品种品系级别');
  });
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx
```

Expected: FAIL because the current print preview dialog is named `物流热敏打印机联机预览`, and the rendered content still includes unsupported certification/cryptographic claims and ignored local custom fields.

## Task 2: Make the Trace Label Workflow Truthful

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.tsx`

- [ ] **Step 1: Trim unused local-only template editor imports and state**

Change the import from:

```tsx
import { Plus, Printer, Search, QrCode, X, Settings2, GripVertical, MapPin, ShieldCheck } from 'lucide-react';
```

to:

```tsx
import { Plus, Printer, Search, QrCode, X, ShieldCheck } from 'lucide-react';
```

Remove these local-only template editor states and handlers:

```tsx
  // H5 Template Editor State
  const [showH5Editor, setShowH5Editor] = useState(false);

  const [abTestMode, setAbTestMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A');

  const [templateBlocksA, setTemplateBlocksA] = useState([
    { id: 'brand_video', name: '品牌宣传视频', enabled: true },
    { id: 'product_info', name: '芍药品种与规格', enabled: true },
    { id: 'trace_timeline', name: '全生命周期溯源轴', enabled: true },
    { id: 'quality_report', name: '权威质检与认证报告', enabled: true },
    { id: 'farmer_word', name: '培育师傅寄语', enabled: true },
    { id: 'consumer_marketing', name: '消费者互动营销 (扫码领积分/抽奖)', enabled: false },
  ]);

  const [templateBlocksB, setTemplateBlocksB] = useState([
    { id: 'consumer_marketing', name: '消费者互动营销 (扫码领积分/抽奖)', enabled: true },
    { id: 'brand_video', name: '品牌宣传视频', enabled: true },
    { id: 'trace_timeline', name: '全生命周期溯源轴', enabled: true },
    { id: 'product_info', name: '芍药品种与规格', enabled: true },
    { id: 'quality_report', name: '权威质检与认证报告', enabled: false },
    { id: 'farmer_word', name: '培育师傅寄语', enabled: false },
  ]);

  const activeBlocks = activeTab === 'A' ? templateBlocksA : templateBlocksB;
  const setActiveBlocks = activeTab === 'A' ? setTemplateBlocksA : setTemplateBlocksB;

  const moveBlock = (index: number, direction: 'up' | 'down') => { ... };
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const handleDragStart = (e: React.DragEvent, index: number) => { ... };
  const handleDragEnter = (e: React.DragEvent, index: number) => { ... };
  const handleDragEnd = () => { ... };
  const toggleBlock = (index: number) => { ... };
```

Also remove the entire `{showH5Editor && (...)}` modal block.

- [ ] **Step 2: Replace ignored custom label fields**

Remove the side-panel block containing:

```tsx
<p className="text-xs font-bold text-slate-700">配置溯源标签自定义批次规格</p>
...
<label ...>源头温室棚室标识</label>
...
<label ...>花卉品种品系级别</label>
```

Replace it with a read-only statement:

```tsx
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-700">标签数据来源</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  打印标签仅使用当前批次资料和服务端生成的溯源码。未接入的营销、质检、加密证明或地理标志能力不会出现在生产标签中。
                </p>
              </div>
```

- [ ] **Step 3: Replace fake side-panel sample wording**

Change the sample card from:

```tsx
<QRCodeSVG value={traceUrl(`${activeCrop.batchNo}-样例`)} size={120} />
<p>预览专属赋码样式: <br/>自动注入地理标志与全网唯一身份序列号</p>
```

to:

```tsx
<QRCodeSVG value={traceUrl(cropCodes[activeCrop.id] ?? activeCrop.batchNo)} size={120} />
<p className="text-xs text-center text-slate-500 leading-relaxed font-medium">
  {cropCodes[activeCrop.id]
    ? '已生成真实溯源码，可打印或扫码验证。'
    : '选择数量并生成后，二维码将指向真实溯源码。'}
</p>
```

- [ ] **Step 4: Replace money-like credit copy**

Change:

```tsx
<span className="text-xs font-bold text-slate-700">平台系统预计扣除额度</span>
<span className="font-mono font-black text-red-600 text-base">¥ {(qrAmount * 0.05).toFixed(2)}</span>
```

to:

```tsx
<span className="text-xs font-bold text-slate-700">预计扣除二维码额度</span>
<span className="font-mono font-black text-red-600 text-base">{Number.isFinite(qrAmount) ? qrAmount : 0} 个</span>
```

- [ ] **Step 5: Replace the print preview label with backend-backed facts**

Change the preview dialog label from:

```tsx
aria-label="物流热敏打印机联机预览"
...
物流热敏打印机联机预览 (4x6寸)
...
官方溯源认证
...
权威质检 PASSED
...
Scan to verify authenticity via zero-knowledge proof
...
{Date.now().toString(16).toUpperCase()}-OAUTH-OK
```

to truthful content with this shape:

```tsx
aria-label="溯源码标签打印预览"
...
溯源码标签打印预览 (4x6寸)
...
溯源码标签
...
扫码查看该批次已登记的溯源信息
...
<th>当前状态</th>
<td>{statusLabel(crop.status)}</td>
...
<p>扫码进入公开溯源页</p>
<p className="mt-2 font-mono text-slate-500">{cropCodes[crop.id] ?? crop.batchNo}</p>
```

Add a small local helper near `traceUrl`:

```tsx
  const statusLabel = (status: Crop['status']) => {
    if (status === 'Planting') return '组培扩繁中';
    if (status === 'Growing') return '大棚养护中';
    if (status === 'Harvested') return '已完成出圃';
    if (status === 'Distributed') return '已流转终端市场';
    return status;
  };
```

- [ ] **Step 6: Run the focused test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx
```

Expected: PASS.

## Task 3: Focused Verification and Review

**Files:**
- No new source files.

- [ ] **Step 1: Run focused typecheck/test checks**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec tsc --noEmit
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx src/api/trace.spec.ts
```

Expected: both commands pass.

- [ ] **Step 2: Run local verification**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: shared/backend/web/miniapp local verification passes.

- [ ] **Step 3: Run e2e DB precheck**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

Expected in the current interrupted environment may still be `ECONNREFUSED 127.0.0.1:5544`. If so, record it as an environment blocker and do not claim e2e passed.

- [ ] **Step 4: Request code review**

Dispatch a reviewer with:

```text
DESCRIPTION: P2D trace label truthfulness cleanup for MerchantAdmin.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-07-06-trace-label-truthfulness-p2d.md
BASE_SHA: 441c9a6
HEAD_SHA: current HEAD after implementation
Review focus: production-visible fake/inert claims, print preview truthfulness, and accidental removal of the real trace-code API flow.
```

- [ ] **Step 5: Commit if review and verification are clean**

Run:

```powershell
git add packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx docs/superpowers/plans/2026-07-06-trace-label-truthfulness-p2d.md
git commit -m "fix(web): make trace labels truthful"
```

Expected: one focused P2D commit.

## Self-Review

Spec coverage:
- Phase 2 requires visible production pages to avoid unimplemented blockchain, quality, cryptographic, push, AI, or local-only claims. This plan removes unsupported label/print claims from the active merchant trace-code workflow.
- The real trace-code generation API remains in place and still consumes code credits through `generateCodes`.

Placeholder scan:
- No TBD/TODO/fill-later steps remain.

Type consistency:
- `statusLabel` accepts `Crop['status']`, matching the existing `Crop` type used in the component.
- The test uses existing mocks and follows the current `MerchantAdmin.actions.spec.tsx` structure.
