# P0 溯源标签真实 PDF 导出实施计划

> **执行说明：** 实施时按任务顺序使用 `subagent-driven-development`（推荐）或 `executing-plans`。每个任务均按 RED -> GREEN -> REFACTOR 执行并独立提交；不得使用 `using-superpowers`。

**目标：** 为批次已生成的溯源码提供作用域安全、可下载、可预览、可打印的真实 PDF 标签文件，完整支持 A4、4x6 英寸、2x1 英寸以及 1~500 张标签，不再用页面 DOM 或 `window.print()` 冒充 PDF。

**架构：** 共享包定义严格 Zod 请求合约；NestJS `trace` 模块负责租户/批次/code 集合校验、字体与公开 URL 配置、二维码和 PDF 渲染；Web 请求层复用现有一次 401 刷新语义读取二进制文件；独立 `BatchLabelWorkspace` 只管理真实 PDF Blob 的生成、预览、下载与打印；`BatchAdmin` 仅负责生码、已有码选择以及工作区编排。

**技术栈：** TypeScript 5.8、Zod 3、NestJS 10、Prisma 5、`pdf-lib`、`@pdf-lib/fontkit`、`qrcode`、React 19、Vite 6、Vitest、Testing Library、PostgreSQL/PostGIS、宝塔/Nginx/PM2。

---

## 已批准输入与硬边界

- 设计规范：`docs/superpowers/specs/2026-07-17-p0-trace-label-pdf-export-design.md`
- 实施工作树：`E:\code\nongchang\.worktrees\p0-farm-record-auto-publication`
- 计划基线：`536eda4 docs(trace): require embeddable PDF font`
- API：`POST /api/trace/codes/:batchId/labels.pdf`
- 单次上限：去重后的 `codeIds` 为 1~500；省略 `codeIds` 表示该批次全部已生成码，但总量仍不得超过 500。
- 权限：`SYSTEM_ADMIN`、`AGENT_ADMIN`、`MERCHANT`，且必须具有 `Permission.TRACE_VIEW`。
- 安全：先校验批次作用域，再读取 code；查询始终包含 `tenantId + batchId`；混入任何其他批次/租户 id 时整体 `403`。
- 副作用：导出链路不得调用 `BillingService`、不得创建 `TraceCode`、不得更新扫码数、不得开启数据库事务或写临时 PDF 文件。
- 配置：二维码地址只来自 `WEB_BASE_URL`；生产环境必须为 HTTPS。中文字体只来自 `TRACE_PDF_FONT_PATH` 指向的独立 `.ttf/.otf` 文件，不接受 `.ttc`。
- 部署：无 Prisma schema 或 migration 变更；先部署 backend，完成 endpoint smoke，再部署 Web。
- 保护边界：根 checkout 中用户修改的 `packages/web/src/api/trace.spec.ts` 不得修改、暂存或还原；所有实施只在上述 worktree 中进行。

## 目标文件结构

### Shared

- Create: `packages/shared/src/dto/trace-label-pdf.dto.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.schema.spec.ts`

共享包当前没有独立 Vitest 门禁，因此沿用仓库现有做法，在 backend 单元测试中直接验证共享 schema，避免为一个合约引入新的测试运行器配置。

### Backend

- Create: `packages/backend/src/modules/trace/trace-label-pdf.model.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.model.spec.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.renderer.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.renderer.spec.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.service.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.service.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.controller.ts`
- Modify: `packages/backend/src/modules/trace/trace.controller.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.module.ts`
- Create: `packages/backend/test/trace-label-pdf.e2e-spec.ts`
- Modify: `packages/backend/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/backend/.env.example`

### Web

- Modify: `packages/web/src/api/request.ts`
- Modify: `packages/web/src/api/request.spec.ts`
- Modify: `packages/web/src/api/trace.ts`
- Modify: `packages/web/src/api/trace.spec.ts`
- Create: `packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx`
- Create: `packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx`
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Modify: `packages/web/src/components/BatchAdmin.spec.tsx`
- Modify: `packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx`
- Modify: `packages/web/src/index.css`

### Deployment Docs

- Modify: `docs/deploy/baota.md`
- Modify: `docs/ops/production-verification.md`

## 统一验证命令

以下命令均在实施工作树根目录执行：

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.schema.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.model.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.renderer.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.service.spec.ts src/modules/trace/trace.controller.spec.ts
corepack pnpm@10.33.2 --filter web test -- src/api/request.spec.ts src/api/trace.spec.ts
corepack pnpm@10.33.2 --filter web test -- src/components/batch-admin/BatchLabelWorkspace.spec.tsx src/components/BatchAdmin.spec.tsx
corepack pnpm@10.33.2 verify:local
```

PostGIS 完整门禁见 Task 10，不得把 `verify:local` 误报为 E2E 或生产门禁通过。

---

## Task 1：建立共享 `TraceLabelPdfInput` 合约

**Files:**

- Create: `packages/shared/src/dto/trace-label-pdf.dto.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.schema.spec.ts`

- [ ] **Step 1：先写失败的共享合约测试**

测试必须从 `@nongchang/shared` 导入以下稳定名称：

```ts
import {
  TRACE_LABEL_PAPER_DEFAULTS,
  traceLabelPdfInputSchema,
  type ResolvedTraceLabelPdfInput,
  type TraceLabelPdfInput,
} from '@nongchang/shared';
```

覆盖：

```ts
it.each([
  ['A4', { marginMm: 8, gapMm: 3, qrSizeMm: 24 }],
  ['4x6', { marginMm: 6, gapMm: 0, qrSizeMm: 50 }],
  ['2x1', { marginMm: 2, gapMm: 0, qrSizeMm: 18 }],
] as const)('applies %s defaults', (paperSize, expected) => {
  expect(traceLabelPdfInputSchema.parse({ paperSize })).toMatchObject({
    paperSize,
    ...expected,
    showProductName: true,
    showSerial: true,
  });
});

it('deduplicates UUIDs before enforcing the 500-code cap', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  expect(traceLabelPdfInputSchema.parse({ codeIds: [id, id] }).codeIds).toEqual([id]);
});
```

再覆盖：默认 `paperSize=A4`、未知字段被 `.strict()` 拒绝、`codeIds=[]`、非法 UUID、501 个唯一 id、非法 enum、非整数以及 `marginMm/gapMm/qrSizeMm` 的上下界。

- [ ] **Step 2：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.schema.spec.ts
```

预期：因共享包尚未导出 `traceLabelPdfInputSchema` 等符号而失败。记录失败，不得用跳过测试代替。

- [ ] **Step 3：实现严格 schema 和输入/输出类型**

`TraceLabelPdfInput` 保持批准规范中的可选请求字段；`ResolvedTraceLabelPdfInput` 表示 Zod 解析后的完整值：

```ts
export const traceLabelPaperSizeSchema = z.enum(['A4', '4x6', '2x1']);

export const TRACE_LABEL_PAPER_DEFAULTS = {
  A4: { marginMm: 8, gapMm: 3, qrSizeMm: 24 },
  '4x6': { marginMm: 6, gapMm: 0, qrSizeMm: 50 },
  '2x1': { marginMm: 2, gapMm: 0, qrSizeMm: 18 },
} as const;
```

实现要点：

- `codeIds` 用 `z.preprocess` 在 `.min(1).max(500)` 前去重。
- id 必须为 UUID；不得静默删除非法值。
- 三个毫米数值均为有限整数；`marginMm/gapMm` 为 0~20，`qrSizeMm` 为 15~80。
- `paperSize` 先默认到 `A4`，再按对应纸型补全三个毫米默认值。
- `showProductName/showSerial` 默认 `true`。
- 导出 `TraceLabelPaperSize`、`TraceLabelPdfInput`（`z.input`）和 `ResolvedTraceLabelPdfInput`（`z.output`）。

- [ ] **Step 4：构建 shared 并运行 GREEN**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.schema.spec.ts
```

预期：shared 构建成功，合约测试全部通过。

- [ ] **Step 5：提交 Task 1**

```powershell
git add packages/shared/src/dto/trace-label-pdf.dto.ts packages/shared/src/index.ts packages/backend/src/modules/trace/trace-label-pdf.schema.spec.ts
git commit -m "feat(shared): define trace label pdf contract"
```

---

## Task 2：实现纸张、分页、公开 URL 和文件名纯模型

**Files:**

- Create: `packages/backend/src/modules/trace/trace-label-pdf.model.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.model.spec.ts`

- [ ] **Step 1：写模型 RED 测试**

固定导出名称：

```ts
mmToPoints
resolveTraceLabelLayout
paginateTraceLabels
normalizeTraceWebBaseUrl
buildPublicTraceUrl
buildTraceLabelPdfFileName
buildTraceLabelContentDisposition
```

测试至少锁定：

- `mmToPoints(25.4) === 72`（允许浮点近似）。
- A4 为 `210 x 297 mm`、3 列 x 7 行、每页 21 张；22 张为 2 页；500 张为 24 页且标签总数不丢失。
- 4x6 为 `4 x 6 inch`、每页 1 张；2x1 为 `2 x 1 inch`、每页 1 张。
- 默认布局均可容纳；例如 A4 `qrSizeMm=80`、2x1 边距或二维码过大时抛 `BadRequestException`。
- `https://farm.example.com/` 归一化为无尾斜杠基址。
- 生产环境拒绝 `http:`、相对 URL、`javascript:`；不得从 Host/Origin 构造地址。
- code `ORC/A B` 生成 `https://farm.example.com/#/trace/ORC%2FA%20B`。
- 批次号中的 CR/LF、引号、斜杠、路径片段不会进入文件名或响应头。
- `Content-Disposition` 同时包含 ASCII fallback 和 RFC 5987 `filename*=UTF-8''...`，且无换行。

- [ ] **Step 2：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.model.spec.ts
```

预期：模块不存在。

- [ ] **Step 3：实现布局模型**

模型必须使用物理尺寸，不复用当前 UI 的 px 滑块：

```ts
const PAPER_MM = {
  A4: { width: 210, height: 297, columns: 3, rows: 7, footer: 8 },
  '4x6': { width: 101.6, height: 152.4, columns: 1, rows: 1, footer: 0 },
  '2x1': { width: 50.8, height: 25.4, columns: 1, rows: 1, footer: 0 },
} as const;
```

`resolveTraceLabelLayout()` 返回 point 单位的页面、边距、gap、单元格、二维码尺寸和 capacity。二次适配校验必须同时验证：

- 可用宽高为正。
- A4/4x6 的二维码和固定文本带可放入单元格。
- 2x1 使用横向紧凑布局，二维码可放入高度，剩余文本宽度至少 22mm。
- 二维码 PNG 自带 quiet zone，布局不得裁切该图片边界。

`paginateTraceLabels()` 只切只读数组，保持输入顺序，不修改输入。

- [ ] **Step 4：实现 URL 与响应头模型**

`normalizeTraceWebBaseUrl(raw, nodeEnv)` 使用 WHATWG `URL`：只接受 `http/https`，生产只接受 `https`，删除 path 尾斜杠但保留合法部署子路径；错误统一抛不含原始敏感值的 `ServiceUnavailableException`。

`buildTraceLabelPdfFileName()` 将批次号限制为安全 ASCII `[A-Za-z0-9._-]`，连续非法字符折叠为 `-`，去除首尾点/横线，最大 80 字符，空结果回退为 `batch`。

- [ ] **Step 5：运行 GREEN 与回归**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.model.spec.ts src/modules/trace/trace-label-pdf.schema.spec.ts
```

预期：全部通过。

- [ ] **Step 6：提交 Task 2**

```powershell
git add packages/backend/src/modules/trace/trace-label-pdf.model.ts packages/backend/src/modules/trace/trace-label-pdf.model.spec.ts
git commit -m "feat(trace): model pdf label layouts"
```

---

## Task 3：安装依赖并实现真实 PDF renderer

**Files:**

- Modify: `packages/backend/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.renderer.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.renderer.spec.ts`

- [ ] **Step 1：安装受控依赖**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend add pdf-lib @pdf-lib/fontkit qrcode
corepack pnpm@10.33.2 --filter @nongchang/backend add -D @types/qrcode
```

确认只修改 backend package 和根 lockfile，不向 Web 添加 PDF/Canvas 依赖。

- [ ] **Step 2：写 renderer RED 测试**

固定公开接口：

```ts
export interface TraceLabelPdfRenderInput {
  batchNo: string;
  cropName: string;
  codes: ReadonlyArray<{ code: string }>;
  options: ResolvedTraceLabelPdfInput;
  webBaseUrl: string;
  fontBytes: Uint8Array;
}

export interface TraceLabelPdfRenderResult {
  bytes: Uint8Array;
  pageCount: number;
}

export class TraceLabelPdfRenderer {
  render(input: TraceLabelPdfRenderInput): Promise<TraceLabelPdfRenderResult>;
}
```

测试通过导出的纯函数 `renderTraceLabelPdf(input, testDependencies)` 注入：

- `PDFDocument.embedFont(StandardFonts.Helvetica)` 的 ASCII 测试字体嵌入器。
- ASCII 测试文案，避免 CI 依赖宿主中文字体。
- 可观察的 `toQrPng(url)`；分页压力测试可复用一份有效 PNG 以控制耗时。

覆盖：

- 结果前五字节为 `%PDF-`，且 `PDFDocument.load(bytes)` 能重新读取。
- A4 22 张为 2 页，500 张为 24 页，QR 生成调用分别为 22/500 次。
- 4x6、2x1 的 3 张均为 3 页。
- QR 输入 URL 与每个数据库 code 一一对应并正确编码。
- 并发 QR 任务峰值不超过 8。
- 非法/不可嵌入自定义字体抛专用 `TraceLabelPdfFontError`，错误不包含字体路径。
- PDF 文本中只使用 `batchNo/cropName/code/公开 URL/序号/页码`，renderer 输入类型不接受 tenant、owner、成本或 GPS 字段。

- [ ] **Step 3：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.renderer.spec.ts
```

预期：renderer 模块不存在。

- [ ] **Step 4：实现 renderer 与有限并发**

实现要求：

- 每次请求创建一个 `PDFDocument`，注册 `fontkit`，嵌入服务传入的完整字体子集。
- QR 使用 `qrcode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 4 })`；4x6/2x1 可使用 `H`，但同一纸型必须稳定。
- 按最多 8 个一组执行 `Promise.all`，每组完成后再继续，禁止一次启动 500 个任务。
- 坐标只来自 Task 2 layout；A4 按从左到右、从上到下顺序绘制 21 张/页。
- A4 绘制批次号、品种、完整 code、扫码提示和 `第 X / Y 页`；4x6 绘制大 QR 与完整 code；2x1 横向放置 QR 与紧凑文本。
- 对品种/批次展示文本按字体实际宽度截断并加省略号；不得截断二维码 URL 或 code。
- `showProductName=false` 时不绘制品种；`showSerial=false` 时不绘制 code/序号，但二维码仍必须对应真实 code。
- `save()` 结果只留在内存，不写 `tmp` 或项目目录。

纯函数允许测试依赖覆盖；Nest 可注入类必须始终调用生产依赖，不能暴露 HTTP 参数来选择字体或测试文案。

- [ ] **Step 5：运行 GREEN、构建并检查依赖**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.renderer.spec.ts src/modules/trace/trace-label-pdf.model.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 list --filter @nongchang/backend --depth 0
```

预期：测试和构建通过；PDF 依赖只存在 backend。

- [ ] **Step 6：提交 Task 3**

```powershell
git add packages/backend/package.json pnpm-lock.yaml packages/backend/src/modules/trace/trace-label-pdf.renderer.ts packages/backend/src/modules/trace/trace-label-pdf.renderer.spec.ts
git commit -m "feat(trace): render label pdf files"
```

---

## Task 4：实现作用域安全、只读的 `TraceLabelPdfService`

**Files:**

- Create: `packages/backend/src/modules/trace/trace-label-pdf.service.ts`
- Create: `packages/backend/src/modules/trace/trace-label-pdf.service.spec.ts`

- [ ] **Step 1：写 service RED 测试**

测试 fixture 明确只提供读方法；不要把 `BillingService` 传入构造函数。覆盖：

1. `scope.assertInScope` 完成后才允许 batch/code 查询。
2. batch 二次读取包含 `{ id: batchId, tenantId: user.tenantId }`，只 select `batchNo/cropName`。
3. code 查询始终包含 `tenantId + batchId`，排序固定为 `createdAt ASC, id ASC`。
4. 指定 id 时查询包含 `id: { in: uniqueIds }`；返回集合与请求集合不完全相等时抛 `403`，renderer 不调用。
5. 未指定 id 时使用 `take: 501` 探测上限；0 张或 501 张抛 `400`。
6. 成功时 renderer 只收到 `{ code }`，不收到 tenantId、ownerId、扫码记录、成本或内部备注。
7. `WEB_BASE_URL` 缺失/非法、生产非 HTTPS、字体路径缺失/扩展名错误/不是普通文件/不可读时抛 `503`。
8. `.ttc` 明确拒绝；`.ttf/.otf` 接受且成功字节缓存在 service 实例中。
9. renderer 的 `TraceLabelPdfFontError` 映射为不暴露路径/堆栈的 `503`；其他 renderer 异常保持 `500` 语义并由 Nest 统一日志处理。
10. 连续两次成功导出不会调用任何 Prisma create/update/delete/$transaction，也不会产生计费调用。

- [ ] **Step 2：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.service.spec.ts
```

预期：service 模块不存在。

- [ ] **Step 3：实现 fail-closed 查询顺序**

核心查询形态必须保持：

```ts
await this.scope.assertInScope(this.prisma, user, 'batch', batchId);

const batch = await this.prisma.batch.findFirst({
  where: { id: batchId, tenantId: user.tenantId },
  select: { batchNo: true, cropName: true },
});

const requestedIds = input.codeIds;
const codes = await this.prisma.traceCode.findMany({
  where: {
    tenantId: user.tenantId,
    batchId,
    ...(requestedIds ? { id: { in: requestedIds } } : {}),
  },
  select: { id: true, code: true, createdAt: true },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  ...(!requestedIds ? { take: 501 } : {}),
});
```

作用域校验之后若 batch 因并发删除而消失，仍 fail closed 为 `403`。指定 id 时用集合相等性校验，不返回部分结果，也不指出哪个 id 属于其他租户。

- [ ] **Step 4：实现配置与字体缓存**

使用 `node:fs/promises` 的 `stat/readFile`：

- 路径只从 `process.env.TRACE_PDF_FONT_PATH` 读取。
- 扩展名大小写归一化后只允许 `.ttf/.otf`。
- `stat.isFile()` 必须为真。
- 仅在读取成功后赋值到 `private fontBytes?: Uint8Array`；失败不缓存 rejection，修复配置并重启/重试后可恢复。
- 客户端错误消息只说明“PDF 中文字体不可用”，不得回显服务器绝对路径。

服务返回：

```ts
type TraceLabelPdfFile = {
  bytes: Uint8Array;
  fileName: string;
  labelCount: number;
  pageCount: number;
};
```

- [ ] **Step 5：运行 GREEN 与 trace 回归**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.service.spec.ts src/modules/trace/trace.service.spec.ts
```

预期：新 service 与现有生码/额度测试均通过，证明导出没有破坏计费链路。

- [ ] **Step 6：提交 Task 4**

```powershell
git add packages/backend/src/modules/trace/trace-label-pdf.service.ts packages/backend/src/modules/trace/trace-label-pdf.service.spec.ts
git commit -m "feat(trace): secure label pdf export"
```

---

## Task 5：接入 controller/module、权限与响应头

**Files:**

- Modify: `packages/backend/src/modules/trace/trace.controller.ts`
- Modify: `packages/backend/src/modules/trace/trace.controller.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.module.ts`

- [ ] **Step 1：扩展 controller RED 测试**

新增 handler 固定命名 `createLabelPdf`，测试：

- roles 精确等于 `[SYSTEM_ADMIN, AGENT_ADMIN, MERCHANT]`。
- permissions 精确等于 `[TRACE_VIEW]`。
- 直接调用 handler 时 service 获得当前 `AuthUser`、batchId 和 Zod 已解析完整参数。
- 返回 `StreamableFile`，其自身 headers 包含 `application/pdf` 和 RFC 5987 attachment；通过 Nest header metadata 锁定 `private, no-store`，最终组合结果由 E2E 验证。
- POST 被显式设为 HTTP 200，而不是 Nest 默认 201。

- [ ] **Step 2：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace.controller.spec.ts
```

预期：`createLabelPdf` 不存在。

- [ ] **Step 3：实现 endpoint**

控制器形态：

```ts
@Post('codes/:batchId/labels.pdf')
@HttpCode(HttpStatus.OK)
@Header('Cache-Control', 'private, no-store')
@Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT)
@Permissions(Permission.TRACE_VIEW)
async createLabelPdf(
  @CurrentUser() user: AuthUser,
  @Param('batchId') batchId: string,
  @Body(new ZodValidationPipe(traceLabelPdfInputSchema)) input: ResolvedTraceLabelPdfInput,
) {
  const file = await this.labelPdf.create(user, batchId, input);
  return new StreamableFile(Buffer.from(file.bytes), {
    type: 'application/pdf',
    disposition: buildTraceLabelContentDisposition(file.fileName),
  });
}
```

`TraceModule` 注册 `TraceLabelPdfService` 和 `TraceLabelPdfRenderer`。保留现有 `BillingModule` 仅供 `TraceService.generateCodes` 使用；PDF service 不得注入 billing。

- [ ] **Step 4：运行 GREEN、模块构建与全部 trace 单测**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

预期：trace 目录测试和 Nest 构建通过。

- [ ] **Step 5：提交 Task 5**

```powershell
git add packages/backend/src/modules/trace/trace.controller.ts packages/backend/src/modules/trace/trace.controller.spec.ts packages/backend/src/modules/trace/trace.module.ts
git commit -m "feat(trace): expose label pdf endpoint"
```

---

## Task 6：补齐 PostGIS E2E、字体配置和宝塔运行手册

**Files:**

- Create: `packages/backend/test/trace-label-pdf.e2e-spec.ts`
- Modify: `packages/backend/.env.example`
- Modify: `docs/deploy/baota.md`
- Modify: `docs/ops/production-verification.md`

- [ ] **Step 1：写独立 fixture 的 E2E 验证**

E2E 使用唯一前缀创建：

- 主租户下的 owner、field、空批次、3-code 批次、501-code 批次。
- 第二租户及 system admin、field、batch、code，用于跨租户与混入 id 测试。
- 临时 `.ttf` 普通文件和 `WEB_BASE_URL=https://farm.example.test`；测试编译模块时 override `TraceLabelPdfRenderer`，让它用 `pdf-lib` 生成结构有效的最小 PDF。这样 E2E 验证真实 HTTP/鉴权/Prisma/响应合约，同时不把宿主字体变成 CI 前置条件；生产字体嵌入由 renderer 单测和部署 smoke 验证。

覆盖：

1. 有权限用户导出 3 个指定 id：200、`application/pdf`、正确 disposition、`private, no-store`、body 以 `%PDF-` 开头且可被 `PDFDocument.load`。
2. A4 3 张为 1 页；响应 renderer 收到固定顺序的 3 个数据库 code。
3. 其他租户访问主租户 batch：403。
4. 主批次 codeIds 混入第二租户/其他批次 id：整个请求 403，无 PDF body。
5. 空批次导出全部：400。
6. 501-code 批次导出全部：400；显式选 500 个仍成功。
7. Zod 拒绝空数组、501 个唯一 id、非法纸型和非法布局：400。

teardown 必须用与 `farm-record-publication.e2e-spec.ts` 相同的聚合错误策略，按 trace code -> batch -> field -> user/group -> tenant -> temp file -> app 顺序清理，并在最终删除前断言唯一前缀 fixture 零残留。

- [ ] **Step 2：运行新 E2E 并记录真实结果**

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e -- trace-label-pdf.e2e-spec.ts
```

预期：前置单元测试已经驱动 endpoint 实现，因此该 E2E 可能首次即通过，也可能暴露 HTTP/Prisma 集成缺口；不得为了制造 RED 人为破坏实现。若本地 PostGIS 未运行，预期由 `check-e2e-db.ts` 明确报连接阻塞，不得伪造通过。

- [ ] **Step 3：完成 E2E 并运行 GREEN**

先按需要启动/准备数据库：

```powershell
docker compose -f docker-compose.dev.yml up -d
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e -- trace-label-pdf.e2e-spec.ts
```

预期：聚焦 E2E 退出 0，且 teardown 后无 fixture 残留。

- [ ] **Step 4：补充配置示例与宝塔步骤**

`.env.example` 增加：

```env
# 溯源标签 PDF 中文字体；必须是可独立嵌入的 .ttf/.otf，不接受 .ttc。
TRACE_PDF_FONT_PATH=
```

`docs/deploy/baota.md` 明确：

- 安装/上传 Noto Sans SC 的独立 TTF/OTF，并确认许可证允许服务端嵌入。
- 示例路径：`/www/server/fonts/NotoSansSC-Regular.ttf`。
- 使用 `test -r`、`file`、`fc-scan` 或 `fc-query` 确认普通文件、格式和可读权限；不要把 `/usr/share/fonts/.../*.ttc` 填入。
- `.env` 同时配置公网 HTTPS `WEB_BASE_URL` 和字体路径，PM2 重启并保存进程列表。
- 用有 `trace:view` 权限的 token 调 endpoint，将响应保存为 `.pdf`，再用 `file/pdfinfo` 检查格式和页数。
- backend 先于 Web 发布；回滚先回 Web 再回 backend，无数据库回滚。

`docs/ops/production-verification.md` 增加 PDF preflight/smoke 和证据记录字段：字体实际路径、文件 hash、3 张 A4 页数、中文显示、抽查 3 个 QR URL、响应头、执行人和时间。

- [ ] **Step 5：运行文档与配置静态检查**

```powershell
Select-String -Path packages/backend/.env.example,docs/deploy/baota.md,docs/ops/production-verification.md -Pattern 'TRACE_PDF_FONT_PATH','NotoSansSC-Regular.ttf','labels.pdf','WEB_BASE_URL'
git diff --check
```

预期：四类关键内容均可检索，diff 无空白错误。

- [ ] **Step 6：提交 Task 6**

```powershell
git add packages/backend/test/trace-label-pdf.e2e-spec.ts packages/backend/.env.example docs/deploy/baota.md docs/ops/production-verification.md
git commit -m "test(trace): cover label pdf export operations"
```

---

## Task 7：复用认证刷新语义请求二进制 PDF

**Files:**

- Modify: `packages/web/src/api/request.ts`
- Modify: `packages/web/src/api/request.spec.ts`
- Modify: `packages/web/src/api/trace.ts`
- Modify: `packages/web/src/api/trace.spec.ts`

- [ ] **Step 1：写 `requestFile` RED 测试**

新增稳定类型：

```ts
export interface ApiFile {
  blob: Blob;
  fileName: string | null;
}

export function requestFile(path: string, init?: RequestInit): Promise<ApiFile>;
```

覆盖：

- 带现有 Bearer token 请求二进制响应，Blob 内容和 `application/pdf` 类型不被 JSON 解析破坏。
- 首次 401 时复用 HttpOnly cookie refresh，并且只重试一次；二次 401 清理 session，行为与 `request<T>` 完全一致。
- 400/403/503 JSON 错误仍通过 `parseError` 得到 backend message，不返回空 Blob。
- RFC 5987 `filename*` 正确 decode；无 header 时 `fileName=null`；恶意路径/CRLF 只保留 basename 安全文件名。
- 并发 JSON 和文件请求的 401 共用一个 refresh promise。

- [ ] **Step 2：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/api/request.spec.ts
```

预期：`requestFile` 不存在。

- [ ] **Step 3：提取共享授权响应流程**

将当前 `request()` 中的 token generation、401 refresh、只重试一次和 error parsing 提取为私有 `authorizedResponse(path, init)`；`request<T>` 继续按原语义解析 JSON，`requestFile` 在同一成功响应上调用 `blob()`。

不得：

- 复制一套 refresh 状态。
- 在文件请求失败时调用 `response.blob()`。
- 改变 logout/login 并发代际保护。
- 把 refresh token 放进 JS 或 localStorage。

- [ ] **Step 4：写 `createTraceLabelPdf` RED 并实现**

`packages/web/src/api/trace.ts` 新增：

```ts
export async function createTraceLabelPdf(
  batchId: string,
  input: TraceLabelPdfInput,
): Promise<ApiFile> {
  return requestFile(`/trace/codes/${encodeURIComponent(batchId)}/labels.pdf`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

API 层再验证：Blob 非空、MIME 为 `application/pdf`、前五字节为 `%PDF-`。200 但内容不符合时抛明确的响应合约错误，不把 HTML/JSON 保存为 `.pdf`。

`trace.spec.ts` 覆盖 URL 编码、POST body、不传 `codeIds` 表示全部、文件返回，以及现有 `generateCodes` 幂等键测试不回归。

- [ ] **Step 5：运行 GREEN 与 Web 类型检查**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/api/request.spec.ts src/api/trace.spec.ts
corepack pnpm@10.33.2 --filter web lint
```

预期：API 测试与 TypeScript 检查通过。

- [ ] **Step 6：提交 Task 7**

```powershell
git add packages/web/src/api/request.ts packages/web/src/api/request.spec.ts packages/web/src/api/trace.ts packages/web/src/api/trace.spec.ts
git commit -m "feat(web): request trace label pdf files"
```

---

## Task 8：实现真实 PDF `BatchLabelWorkspace`

**Files:**

- Create: `packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx`
- Create: `packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx`

- [ ] **Step 1：定义工作区 props 和状态机**

```ts
interface BatchLabelWorkspaceProps {
  batchId: string;
  batchNo: string;
  cropName: string;
  codeIds?: string[];
  labelCount: number;
  initialPaperSize?: TraceLabelPaperSize;
  onClose: () => void;
}
```

状态只允许：`loading | ready | error`。`ready` 持有唯一 `{ blob, objectUrl, fileName }`；布局表单持有 paperSize、marginMm、gapMm、qrSizeMm、showProductName、showSerial。初次打开立即请求 PDF；后续更改参数后由“更新预览”显式请求，避免每次输入都生成大文件。

- [ ] **Step 2：写组件 RED 测试**

覆盖：

1. mount 后只发一次请求，传递指定 `codeIds`；全部导出时不发送 `codeIds`。
2. loading 时更新、下载、打印按钮禁用；重复点击不会形成并发请求。
3. ready 后 iframe/object 的 `src`、下载链接和打印窗口都使用同一个 Blob URL，点击下载/打印不再次调用 API。
4. 打印通过 `window.open(objectUrl)` 打开 PDF 后调用新窗口的 `print()`；不得调用当前后台页面的 `window.print()`。弹窗被阻止时保留下载入口并显示可读提示。
5. 更新参数成功后先 revoke 旧 URL，再显示新 URL；关闭/卸载也 revoke。
6. 请求失败、重试、关闭时不会在卸载组件上 setState；失败不生成下载链接。
7. 400/403/503 message 在工作区内可见；503 明确指向管理员检查站点/字体配置，不暴露服务器路径。
8. A4 22 张显示“22 张 / 2 页”；4x6、2x1 显示一张一页；labelCount 不由 iframe DOM 猜测。

- [ ] **Step 3：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/batch-admin/BatchLabelWorkspace.spec.tsx
```

预期：组件不存在。

- [ ] **Step 4：实现可访问且响应式的工作区**

要求：

- 桌面使用固定宽度设置栏 + 剩余空间 PDF 预览；移动端垂直排列，按钮可换行，不出现横向溢出。
- `<iframe title="溯源标签 PDF 预览">` 只展示后端 Blob URL；不重新绘制 QR 或 DOM 标签。
- 纸张使用 segmented/radio 控件；布尔值用 checkbox；毫米参数使用 number input，标明 mm。
- 主要命令使用 lucide `RefreshCw/Download/Printer/X` 图标并有 tooltip/aria-label。
- 组件内显示“导出已生成溯源码不会再次扣减二维码额度”。
- 不使用嵌套 cards，不添加装饰渐变、巨大标题或假数据。
- 文件名优先采用响应 header；fallback 为 `trace-labels-${safeBatchNo}.pdf`。
- 每次成功创建 URL 后，若该结果已因关闭/新请求而过期，立即 revoke，禁止泄漏。

- [ ] **Step 5：运行 GREEN、完整 Web 单测和 lint**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/batch-admin/BatchLabelWorkspace.spec.tsx
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
```

预期：组件聚焦测试、Web 全测和类型检查通过。

- [ ] **Step 6：提交 Task 8**

```powershell
git add packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx
git commit -m "feat(web): add trace label pdf workspace"
```

---

## Task 9：接入 `BatchAdmin` 生码与已有码流程并删除虚假能力

**Files:**

- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Modify: `packages/web/src/components/BatchAdmin.spec.tsx`
- Modify: `packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx`
- Modify: `packages/web/src/index.css`

- [ ] **Step 1：写集成 RED 测试**

在现有 mocks 中加入 `createTraceLabelPdf`。覆盖：

- 生码成功后把返回的 `TraceCode.id[]`（不是 code 字符串或占位码）交给工作区，保持用户选择的纸型。
- 生码失败时不请求 PDF，数量和纸型仍保留以便重试。
- 已有码弹窗支持逐项选择、全选（总量 <=500）、取消选择、导出选中以及导出全部。
- 总量 >500 时“导出全部”禁用并提示“单次最多 500，请分批选择”；逐项选择达到 500 后禁止继续选择。
- 选中集合切换批次/关闭弹窗时清空，不能带到其他 batch。
- 导出工作区关闭后返回原上下文，旧 Blob 已由工作区回收。
- 页面不再出现“标准 PDF 溯源版”“原始 Excel 数据表”“其余 N 张后续生成”等虚假文案；改为“CSV（Excel 可打开）”。
- 页面任何按钮不调用当前页面 `window.print()`。

- [ ] **Step 2：运行 RED**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.fluent-depth.spec.tsx
```

预期：选择/工作区行为尚未实现，断言失败。

- [ ] **Step 3：收敛 `BatchAdmin` 状态与生成流程**

新增单一工作区编排状态：

```ts
type LabelWorkspaceState = {
  batchId: string;
  batchNo: string;
  cropName: string;
  codeIds?: string[];
  labelCount: number;
  paperSize: TraceLabelPaperSize;
};
```

生码成功：

```ts
const codes = await generateCodes(batchId, qrAmount, requestKey);
setLabelWorkspace({
  batchId,
  batchNo: activeBatch.code,
  cropName: activeBatch.type,
  codeIds: codes.map((code) => code.id),
  labelCount: codes.length,
  paperSize,
});
```

只有 PDF 请求成功后才能显示“PDF 已生成”；生码成功但 PDF 失败时明确区分“溯源码已生成、标签文件生成失败”，重试 PDF 不得再次调用 `generateCodes`。

- [ ] **Step 4：完善已有码选择**

在 `codesList` 弹窗增加原生 checkbox 和选择计数。规则：

- `codesList.length <= 500` 时允许全选/导出全部。
- `codesList.length > 500` 时不允许一键选中超过上限；用户可逐项选择最多 500。
- “导出选中”传 `selectedCodeIds`；“导出全部”省略 `codeIds`。
- 导出只是读操作，界面明确“不再次扣减额度”。
- 列表继续保留复制公开链接和打开公开页。

- [ ] **Step 5：删除虚假 PDF/DOM 打印实现**

从 `BatchAdmin.tsx` 删除：

- `QRCodeSVG` 和 `qrcode.react` 的本组件使用。
- `traceUrl/codeForIndex` 的占位标签路径（公开链接复制所需 URL helper可保留，但必须对 code 做 `encodeURIComponent`）。
- `generatedCodes` 字符串预览、`showPdfPreview`、sheet px sliders、`.print-sheet` 画布和只显示前 21 张的逻辑。
- 三处 `window.print()`。
- “PDF 导出”实际打印整页的全局批次报表入口。
- label padding/spacing/anti-fake 假开关；真实参数由工作区以 mm 提交后端。

从 `index.css` 删除整个 `@media print` 的 `.print-sheet` 隔离块。不要影响其他全局样式。

CSV 入口保留，但类型从 `'excel'` 收敛为 `'csv'`，标题、确认文案和 toast 统一为“CSV（Excel 可打开）”，实际扩展名保持 `.csv`。

- [ ] **Step 6：运行 GREEN、静态搜索和 Web 门禁**

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/batch-admin/BatchLabelWorkspace.spec.tsx src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.fluent-depth.spec.tsx
corepack pnpm@10.33.2 --filter web lint
rg -n "window\.print|print-sheet|标准 PDF 溯源版|原始 Excel 数据表|其余.*后续生成" packages/web/src/components/BatchAdmin.tsx packages/web/src/index.css
```

预期：测试/lint 通过；`rg` 对上述虚假实现返回无匹配。`window.open(...pdfBlobUrl...)` 只允许存在于 `BatchLabelWorkspace`。

- [ ] **Step 7：提交 Task 9**

```powershell
git add packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.spec.tsx packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx packages/web/src/index.css
git commit -m "feat(web): close trace label pdf workflow"
```

---

## Task 10：完整门禁、浏览器/PDF 验收、审查与收尾提交

**Files:**

- Modify only files already in Task 1~9 when verification reveals an in-scope defect.
- Do not modify Prisma schema/migrations, miniapp behavior, unrelated UI, root checkout changes, or deployment secrets.

- [ ] **Step 1：运行 focused tests**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace-label-pdf.schema.spec.ts src/modules/trace/trace-label-pdf.model.spec.ts src/modules/trace/trace-label-pdf.renderer.spec.ts src/modules/trace/trace-label-pdf.service.spec.ts src/modules/trace/trace.controller.spec.ts src/modules/trace/trace.service.spec.ts
corepack pnpm@10.33.2 --filter web test -- src/api/request.spec.ts src/api/trace.spec.ts src/components/batch-admin/BatchLabelWorkspace.spec.tsx src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.fluent-depth.spec.tsx
```

预期：全部退出 0。

- [ ] **Step 2：运行本地生产前门禁**

```powershell
corepack pnpm@10.33.2 verify:local
```

预期：shared build、backend build、Web lint、backend/Web/miniapp unit tests 全部通过。

- [ ] **Step 3：运行完整 PostGIS 生产门禁**

```powershell
docker compose -f docker-compose.dev.yml up -d
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
corepack pnpm@10.33.2 verify:production
```

预期：含全部 PostGIS E2E 的门禁退出 0。若 Docker/PostGIS 不可用，记录准确阻塞和已通过范围，不得声称生产门禁通过。

- [ ] **Step 4：用真实字体启动本地 backend/Web**

在本机选择一个独立 `.ttf/.otf` 做开发 smoke；Windows 可先确认 `C:\Windows\Fonts\simhei.ttf` 是否存在且可嵌入，不存在时安装独立 `NotoSansSC-Regular.ttf`，不得改用 `.ttc`。生产仍使用 Noto Sans SC：

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
$env:WEB_BASE_URL='http://127.0.0.1:5173'
$env:TRACE_PDF_FONT_PATH='C:\Windows\Fonts\simhei.ttf'
corepack pnpm@10.33.2 --filter @nongchang/backend start:dev
```

另开终端：

```powershell
corepack pnpm@10.33.2 --filter web dev -- --host 127.0.0.1
```

若默认端口被占用，使用 Vite 报告的下一可用端口，并同步 `WEB_BASE_URL` 后重启 backend。

- [ ] **Step 5：浏览器桌面/移动端验收**

使用浏览器工具和真实登录态检查：

- 桌面约 `1440x900`：批次管理 -> 生成标签 -> 3 张 -> A4 -> 真实 PDF 预览。
- 移动端约 `390x844`：生成表单、已有码选择、错误状态、工作区按钮不重叠、不裁切、不横向溢出。
- 生成请求 loading 时按钮禁用；关闭/重开不显示旧 PDF。
- 已有码选择 1 张导出；未选择且总量 <=500 时导出全部；>500 的全部导出明确受限。
- 403/400/503 消息可读；没有假成功 toast。
- 下载与打印使用同一 Blob，当前后台页面不进入打印模式。

截图只作为临时 QA 证据；除非审查需要，不提交持久截图文件。

- [ ] **Step 6：下载 PDF 并检查内容**

至少执行：

- A4 22 张：`pdfinfo` 显示 2 页。
- A4 500 张：24 页，renderer/test 证明 QR 调用 500 次，无截断。
- 4x6 3 张：3 页。
- 2x1 3 张：3 页。
- `%PDF-` magic、中文批次/品种、完整 code、文件名和响应头正确。
- 从不同页抽查至少 3 个二维码，解码结果严格等于 `${WEB_BASE_URL}/#/trace/${encodeURIComponent(code)}`，并能打开对应公开溯源页。
- PDF 文本/元数据不包含 tenantId、ownerId、用户 id、成本、GPS、内部备注或额度信息。

生产宝塔 smoke 必须把 `WEB_BASE_URL` 改为真实 HTTPS 域名并使用 `/www/server/fonts/NotoSansSC-Regular.ttf`。

- [ ] **Step 7：审查安全和维护边界**

逐项审查：

- Controller 权限与 service scope 双重存在。
- code 查询没有 tenant/batch 缺口，没有部分成功。
- 响应头无 CRLF/header injection。
- URL 不依赖 Host/Origin/X-Forwarded-Host。
- 字体路径不来自请求，不接受 `.ttc`，异常不回显路径。
- 500 上限在 shared 与 service 双层防守。
- renderer 有限并发，不写磁盘。
- Web 401 只刷新/重试一次，Blob URL 生命周期完整。
- 没有 `window.print()`、DOM 假 PDF、只渲染前 21 张或 Excel 虚假命名残留。
- 无 schema/migration、计费、扫码写入或小程序范围漂移。

- [ ] **Step 8：运行最终静态检查**

```powershell
git diff --check
rg -n "TB[D]|TO[D]O|PLACEH[O]LDER" docs/superpowers/plans/2026-07-18-p0-trace-label-pdf-export.md packages/shared/src/dto/trace-label-pdf.dto.ts packages/backend/src/modules/trace packages/web/src/components/batch-admin packages/web/src/components/BatchAdmin.tsx
rg -n "window\.print|print-sheet" packages/web/src
git status --short
git log --oneline -12
```

预期：无空白错误、无占位符、无假打印残留；status 仅包含审查修复或为空。

- [ ] **Step 9：提交审查修复（仅在确有修改时）**

```powershell
git add <仅列出本轮审查实际修复的文件>
git commit -m "fix(trace): address label pdf review findings"
```

禁止创建空提交。完成后再次运行受影响的 focused test 和 `verify:local`。

- [ ] **Step 10：交付证据**

最终汇报必须包含：

- 分支、最终 HEAD、实施提交列表和工作树状态。
- focused、`verify:local`、`verify:production` 的真实结果。
- 浏览器桌面/移动端、PDF 页数、中文字体和 3 个 QR 抽查结果。
- 若有未完成门禁，给出具体命令、错误与剩余风险。
- 明确声明根 checkout 的用户修改未被触碰。

---

## 验收矩阵

| 需求 | 自动证据 | 人工/部署证据 |
| --- | --- | --- |
| 真实 PDF，不是页面打印 | renderer magic/解析测试；Web API magic 校验；无 `window.print` 静态搜索 | 浏览器下载并用 `pdfinfo` 打开 |
| A4/4x6/2x1 与完整分页 | model/renderer 22、500、三纸型测试 | 22/500/3 张实际文件页数 |
| 同租户同批次 exact-set | service 单测；PostGIS 混入/跨租户 E2E | 审查 Prisma where 与 403 响应 |
| 只读且不重复扣额 | PDF service 无 billing/写 API；现有生码计费回归 | 导出前后额度与 code 数量抽查 |
| 公开 URL 可信 | URL model 与 renderer QR 调用测试 | 解码至少 3 个真实二维码 |
| 字体/config fail closed | service/renderer 503 测试 | 宝塔 Noto 字体 preflight 和 smoke |
| 预览/下载/打印同一 Blob | Workspace 组件测试 | 浏览器 Network 面板仅一次 PDF 请求 |
| 已有码选择与 500 上限 | BatchAdmin 组件测试 | 桌面/移动端操作验收 |
| CSV 文案真实 | BatchAdmin 测试与静态搜索 | UI 检查扩展名为 `.csv` |
| 可上线 | `verify:local` + `verify:production` | 宝塔 backend-first smoke 与回滚检查 |

## 完成定义

只有下列条件同时满足才可将 P0-2 标记完成：

1. 1~500 个真实数据库 code 可生成合法 PDF，A4 22 张为 2 页、500 张为 24 页且不截断。
2. 指定 id exact-set、租户/批次作用域、角色/权限以及 400/403/503 边界均被单测和 PostGIS E2E 证明。
3. PDF 只包含批准公开字段，二维码指向配置的公开 HTTPS 站点。
4. Web 的预览、下载、打印复用同一个真实 Blob，生命周期无泄漏，失败不显示成功。
5. 页面级假 PDF、`.print-sheet`、前 21 张截断和 Excel 虚假命名全部移除。
6. 宝塔字体与站点配置文档、部署 smoke、backend-first 顺序和回滚步骤可执行。
7. focused、`verify:local`、`verify:production`、桌面/移动端 QA 与 PDF/QR 抽查均有真实证据，或对任何环境阻塞做明确的部分验证报告。
