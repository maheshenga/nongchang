# P0-2 溯源标签批量打印与真实 PDF 导出设计

日期：2026-07-17

状态：已确认，待实施

基线：`aa87fb6 fix(records): unify locked publication context`

## 1. 背景与问题

系统现有溯源码生成链路已经是真实业务链路：`TraceService.generateCodes` 会校验批次作用域，使用 `Idempotency-Key` 保证重试安全，并通过二维码额度预约、确认与释放完成计费闭环。Web 端也会把真实 `TraceCode.code` 编入公开溯源 URL。

但标签交付仍未闭环：

- “PDF 导出”实际仅调用 `window.print()`，没有生成可下载、可验证的 PDF 文件；
- A4 预览只渲染前 21 张，数量超过一页时仅显示提示文字，后续标签不会输出；
- 打印和导出依赖当前页面 DOM，结果受浏览器、隐藏弹窗和打印样式影响；
- “Excel”入口实际下载 CSV，界面文案仍可能让用户误认为生成了 `.xlsx`；
- 标签导出缺少跨租户、混入其他批次 code、重复点击和大批量完整性测试。

本子项目把“真实生码”之后的标签交付补齐为后端生成的 PDF，并让下载、预览和打印都使用同一份真实 PDF 数据。

## 2. 目标

1. 为一个有权限访问的批次生成真正的 `application/pdf` 标签文件。
2. PDF 中每个二维码只使用数据库内已存在的 `TraceCode.code`，并指向配置的公开 Web 溯源页面。
3. 支持 A4、4x6 英寸和 2x1 英寸三种固定纸张规格，完整输出全部请求标签，不截断多页数据。
4. 支持导出该批次全部已生成码或指定 code id；所有 id 必须属于同一租户和同一批次。
5. 导出只读，不创建新码、不修改扫码数据、不重复扣二维码额度。
6. 中文字体、公开站点地址和错误边界在宝塔部署中可检查、可验证、可明确失败。
7. Web 端用真实 PDF 完成预览、下载和打印，不再把普通页面打印伪装成 PDF 导出。

## 3. 非目标

- 不修改溯源码生成、额度预约/确认、幂等键或现有数据库模型。
- 不新增 Prisma migration、PDF 文件表、导出任务表或 OSS 持久化。
- 不实现异步队列、后台长任务、邮件发送或历史 PDF 档案。
- 不开放任意 HTML、CSS、字体、颜色或模板脚本输入。
- 不在本轮实现真正的 `.xlsx` 文件；现有 CSV 入口改为“CSV（Excel 可打开）”以保持真实表述。
- 不为小程序增加 PDF 编辑或下载流程。
- 不重构整个 `BatchAdmin`；只抽取与标签/PDF 相关的工作区以降低本次修改风险。

## 4. 方案选择

采用后端 `pdf-lib + @pdf-lib/fontkit + qrcode` 生成 PDF。

选择原因：

- 纯 Node.js 实现，不依赖 Chromium、Puppeteer 或桌面打印环境；
- PDF 页尺寸、分页和二维码尺寸由服务端确定，不受当前浏览器 DOM 影响；
- `pdf-lib` 可在测试中重新加载生成结果并验证页数；
- `qrcode` 可直接生成 PNG 字节并嵌入 PDF；
- 通过 `fontkit` 加载运维配置的中文 TTF/OTF 字体，避免中文乱码。

不采用前端 `html2canvas + jsPDF`，因为 500 张标签会放大 DOM、Canvas 和内存消耗，分页和字体结果也更依赖浏览器。

## 5. 模块边界

### 5.1 Shared 合约

新增 `TraceLabelPdfInput` 及 Zod schema，限制客户端只能传递以下字段：

```ts
type TraceLabelPdfInput = {
  codeIds?: string[];
  paperSize?: 'A4' | '4x6' | '2x1';
  marginMm?: number;
  gapMm?: number;
  qrSizeMm?: number;
  showProductName?: boolean;
  showSerial?: boolean;
};
```

默认值：

- `paperSize = 'A4'`
- A4：`marginMm = 8`、`gapMm = 3`、`qrSizeMm = 24`
- 4x6：`marginMm = 6`、`gapMm = 0`、`qrSizeMm = 50`
- 2x1：`marginMm = 2`、`gapMm = 0`、`qrSizeMm = 18`
- `showProductName = true`
- `showSerial = true`

基础范围：`marginMm` 为 0～20，`gapMm` 为 0～10，`qrSizeMm` 为 15～60。服务端还要按具体纸张尺寸进行二次适配校验，二维码和 quiet zone 无法放入标签时返回 `400`。

### 5.2 Backend

在现有 `trace` 模块中新增：

- `trace-label-pdf.model.ts`：毫米/point 换算、纸张规格、分页、文件名净化、公开 URL 生成和布局校验；
- `trace-label-pdf.service.ts`：加载批次与 code 快照、校验集合、读取字体、生成二维码和 PDF；
- 对应单元测试。

`TraceService.generateCodes` 保持不变。PDF 服务只读取 `Batch` 和 `TraceCode`。

### 5.3 Web

新增或扩展：

- API 二进制请求封装：复用现有 Web cookie/access-token 刷新语义，返回 `Blob`；
- `trace.ts` 的 `createTraceLabelPdf(batchId, input)`；
- `batch-admin/BatchLabelWorkspace.tsx`：只负责标签参数、真实 PDF 预览、下载、打印和状态展示；
- `BatchAdmin.tsx` 继续持有生码 mutation，成功后把本次生成的 code id 交给标签工作区。

## 6. API 合约

### 6.1 请求

```http
POST /api/trace/codes/:batchId/labels.pdf
Authorization: Bearer <access token>
Content-Type: application/json
```

请求体为 `TraceLabelPdfInput`。

使用 `POST` 而不是 `GET`，因为最多 500 个 UUID 会超过常见 Nginx 请求行限制；该操作虽然只读，但请求体承载的是导出选择和布局参数，不创建业务数据。

权限：

- 角色沿用 code 列表：`SYSTEM_ADMIN`、`AGENT_ADMIN`、`MERCHANT`；
- 必须具备 `Permission.TRACE_VIEW`；
- 必须通过 `ScopeService.assertInScope(..., 'batch', batchId)`。

### 6.2 code 选择

- `codeIds` 省略：导出该批次全部已生成码；如果数量为 0，返回 `400`；如果超过 500，返回 `400` 并提示用户分批选择。
- `codeIds` 提供：先去重，去重后必须为 1～500 个 UUID。
- 查询条件始终包含 `tenantId`、`batchId` 和可选 `id in codeIds`。
- 查询结果 id 集合必须与请求集合完全相等；缺失、其他批次或其他租户的 id 均使整个请求返回 `403`，不做部分导出。
- 输出顺序固定为 `createdAt ASC, id ASC`，不接受客户端自定义排序。

### 6.3 响应

成功：

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename*=UTF-8''trace-labels-<safe-batch-no>.pdf
Cache-Control: private, no-store
```

响应体必须以 `%PDF-` 开头。文件名只使用净化后的批次号；不把 owner、tenant、用户输入路径或换行写入响应头。

错误：

- `400`：空 code 集、超过 500、布局参数非法、二维码无法放入纸张；
- `403`：批次无权访问、code 集合不完全属于目标租户/批次；
- `503`：`WEB_BASE_URL` 缺失/非法、中文字体缺失/不可读、PDF 引擎初始化失败；
- `500`：非预期渲染失败，统一记录结构化错误，不向客户端暴露文件路径或堆栈。

## 7. PDF 数据和安全边界

PDF 只允许包含：

- `Batch.batchNo`
- `Batch.cropName`
- `TraceCode.code`
- 由 `WEB_BASE_URL` 和 code 构造的公开 URL
- 当前标签序号、总数、页码

禁止包含：

- `tenantId`、`ownerId`、用户 id、agent id；
- 成本、农资用量、GPS、内部备注、额度或流水信息；
- 客户端提供的任意 URL、HTML、CSS、文件名或文本；
- 未由系统证明的认证、质检、区块链、加密证明或地理围栏声明。

公开 URL 统一为：

```text
${normalized WEB_BASE_URL}/#/trace/${encodeURIComponent(code)}
```

生产环境必须使用 `https:`。服务端不从 `Host`、`Origin` 或 `X-Forwarded-Host` 推导二维码地址，避免 Host header 污染永久打印内容。

## 8. 字体与配置

新增后端环境变量：

```env
TRACE_PDF_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

规则：

- 字体路径只能来自服务端环境变量，不接受请求参数；
- 首次导出时读取并缓存字体字节，后续请求复用；
- 路径缺失、不是普通文件或字体不可嵌入时返回 `503`；
- `WEB_BASE_URL` 缺失、不是绝对 URL或生产环境不是 HTTPS 时返回 `503`；
- 宝塔部署文档增加 Noto CJK 字体安装、实际路径确认和 PDF smoke 命令。

本轮不把大型字体二进制提交到仓库。

## 9. 固定布局

### 9.1 A4

- 页面：210 mm × 297 mm；
- 默认 3 列 × 7 行，每页 21 张；
- 每张标签包含二维码、批次号、品种、溯源码和“扫码查看公开溯源”；
- 页脚显示批次号和 `第 X / Y 页`；
- 多于 21 张时继续创建后续页面，直到全部 code 输出。

### 9.2 4x6

- 页面：4 × 6 英寸；
- 每页 1 张；
- 使用较大二维码和完整 code，适合物流标签机或单张标签。

### 9.3 2x1

- 页面：2 × 1 英寸；
- 每页 1 张；
- 使用紧凑布局；品种过长时按固定宽度截断并保留完整溯源码。

三种布局均保留二维码 quiet zone，并使用足够的纠错等级。二维码尺寸是毫米值，不直接复用当前页面的像素滑块。

## 10. Web 交互流程

### 10.1 新生成标签

1. 用户选择批次、数量和纸张规格。
2. 确认后调用现有 `generateCodes`；生码失败时不请求 PDF，保留参数和错误。
3. 生码成功后，将返回的 code id 作为 `codeIds` 打开标签工作区。
4. 工作区请求真实 PDF，显示加载状态；重复点击期间按钮禁用，同一时刻只有一个请求。
5. 成功后用 Blob URL 在内嵌预览中显示真实 PDF，并展示总标签数和总页数。
6. “下载 PDF”保存同一 Blob；“打印”打开同一 PDF 并调用浏览器原生打印，若浏览器阻止则保留下载回退。

### 10.2 已生成标签

已生成码列表增加：

- 全选/逐项选择；
- “导出选中标签”；
- 未选择时允许“导出全部”，若批次超过 500 个 code，提示先分批选择。

关闭工作区、切换批次或生成新 PDF 时必须撤销旧 Blob URL，避免内存泄漏。

### 10.3 文案真实化

- “标准 PDF 溯源档”只在真实 PDF 下载入口使用；
- 现有 CSV 入口改为“CSV（Excel 可打开）”；
- 明确显示“导出已生成溯源码不会再次扣减二维码额度”；
- 不再显示“其余 N 张后续生成”一类没有实际输出的占位文案。

## 11. 资源与并发边界

- 单次最多 500 张；服务端在生成二维码前完成数量和权限校验。
- PDF 以请求开始时查询到的 code 列表作为只读快照，不在渲染期间持有数据库事务或行锁。
- 强制删除批次会使已打印标签失效，这是现有破坏性删除语义；PDF 不承诺删除后的永久有效性。
- 二维码 PNG 采用有限并发生成，避免 500 个任务同时占用内存。
- PDF Buffer 只在请求内存活，不写临时目录；响应结束后由运行时释放。
- 导出不调用 `BillingService`，也不创建新的 `TraceCode`。

## 12. 测试设计

### 12.1 Shared/model 单元测试

- 默认值和三种 `paperSize`；
- 数值上下界、非整数、非法 enum；
- code id 去重、空数组、501 个 id；
- mm/point 换算、A4 21 张分页、22 张两页、500 张完整分页；
- 文件名净化和公开 URL 编码；
- 布局无法容纳二维码时拒绝。

### 12.2 Backend service 单元测试

- 批次作用域在查询 code 前校验；
- 查询始终带 `tenantId + batchId`；
- 指定 code id 集合完全匹配才渲染；
- 混入其他批次/租户 id 时 `403`，renderer 不执行；
- code 为空或超过 500 时 `400`；
- 不调用 `BillingService`，不写数据库；
- 字体或 `WEB_BASE_URL` 缺失时 `503`；
- renderer 生成字节以 `%PDF-` 开头；
- 使用 `pdf-lib` 重新读取结果并验证页数，22/500 张均不截断。

ASCII 单元测试可使用标准字体；中文字体可用性通过配置单元测试和部署 smoke 验证，避免 CI 依赖宿主机字体。

### 12.3 Controller 和 E2E

- controller 具有角色、`TRACE_VIEW` 权限和 Zod body 校验；
- 成功响应包含正确 `Content-Type`、`Content-Disposition`、`Cache-Control`；
- PostGIS E2E 创建独立租户/批次/code fixture，下载 3 张标签并验证 PDF 结构；
- 跨租户批次、混入外部 code id、空批次、501 张均 fail-closed；
- teardown 使用 FK 安全顺序并聚合清理错误，最终审计 fixture 零残留。

### 12.4 Web

- 二进制请求沿用 access token 刷新，只重试一次；
- 401/403/400/503 错误显示后端消息，不下载空文件；
- 生成成功后传递本次 code id；生成失败不请求 PDF；
- 加载时按钮禁用，重复点击只产生一次请求；
- PDF 成功后预览、下载和打印复用同一 Blob；关闭时调用 `URL.revokeObjectURL`；
- 超过 500 的全部导出提示分批选择；
- UI 不再调用页面级 `window.print()` 冒充 PDF 导出。

### 12.5 最终门禁

- shared、backend、web 聚焦单测；
- backend/web 构建和 Web typecheck；
- 完整 `pnpm.cmd verify:production`；
- 浏览器桌面和移动视口检查标签工作区：无重叠、错误状态可读、真实 PDF 可预览和下载；
- 下载 PDF 后用解析器确认页数和标签数；人工抽查至少 3 个二维码能打开对应公开溯源页。

## 13. 部署与回滚

无数据库迁移，部署顺序为：

1. 在宝塔安装并确认 Noto CJK 字体路径；
2. 配置 `WEB_BASE_URL` 和 `TRACE_PDF_FONT_PATH`；
3. 部署 backend，完成 PDF endpoint smoke；
4. 再部署 Web，使新按钮调用已就绪 endpoint；
5. 用独立测试批次导出 3 张 PDF，验证页数、中文、二维码和公开 URL。

新 backend 与旧 Web 兼容。新 Web 依赖新 endpoint，因此必须 backend 先行。回滚不涉及数据库：可先回滚 Web，再回滚 backend。已下载 PDF 不存于服务器，回滚不会删除用户本地文件。

## 14. 验收标准

本子项目只有同时满足以下条件才算完成：

1. 真实生码后的 1～500 个 code 可导出为合法 PDF，且无额外额度扣减。
2. A4 22 张生成 2 页，500 张全部输出，不出现“仅前 21 张”的截断。
3. PDF 中每个二维码指向该 code 的公开溯源 URL。
4. 指定 code id 必须全部属于当前租户和批次；任何混入均整体拒绝。
5. PDF 不泄露租户、owner、用户、成本、GPS 或内部备注。
6. Web 下载、预览、打印使用真实 PDF Blob，重复点击不会重复请求。
7. 字体或公开站点地址配置错误时明确失败，不输出乱码或错误域名标签。
8. CSV 入口不再宣称生成 `.xlsx`。
9. 聚焦测试、完整生产验证、PostGIS E2E 和浏览器验收全部通过。
