# 子系统 C：Taro 小程序「芍药工作台」设计文档

> 日期：2026-06-14　范围：packages/miniapp

## 目标

把 Taro 小程序从「单栈 4 页」升级为「3 tab 工作台」，**视觉完全照搬** web 端 `MobileView.tsx`（圆角卡片、渐变头部、毛玻璃、3 tab 底栏），所有数据接**真实后端**，并集成 AI 对话/病害诊断；传感器与区块链仅作**可见但禁用的预留入口**。

## 关键决策（已与用户确认）

1. **样式方案**：SCSS + Taro 组件。不引第三方 UI 库。图标用内联 SVG 薄封装（替代 lucide-react），动画用 CSS transition（替代 motion）。
2. **溯源数据源**：批次溯源链路 `GET /trace/events/:batchId`（非公开溯源）。
3. **AI 诊断传图**：先 `POST /uploads` 拿 OSS URL，再 `POST /ai/diagnose {imageUrl}`。
4. **预留程度**：可见但禁用 + 角标（「即将开放/接入中」），点击统一 toast。
5. **待办看板数据源**：A 方案——展示真实「近期农事」（`GET /farm-records` 倒序），保留卡片视觉。
6. **离线队列**：仅作 UI 装饰，不做真实离线缓存队列；提交失败 toast 报错重试。
7. **测试框架**：vitest（与 backend/web 一致，mock `@tarojs/taro`）。

## 架构

### 导航壳
`app.config.ts` 配 `tabBar`，3 个 tab：
- **工作台** `pages/work/index`
- **近期溯源** `pages/trace/index`
- **我的** `pages/me/index`

`pages/login/index` 复刻 MobileView 登录视觉（真实 `login`）。未登录跳登录。
`pages/batch/index` 保留为批次详情子页（从溯源/工作台进）。
旧 `pages/index`（批次列表）逻辑被吸收进溯源/工作台选批次入口。
旧 `pages/record` 记一笔逻辑搬入工作台主屏。

### 文件结构（packages/miniapp/src/）
```
app.config.ts            # tabBar(3 tab) + 注册新页面
styles/theme.scss        # 颜色变量 + 卡片/渐变/毛玻璃 mixin
components/Icon/         # 内联 SVG 图标薄封装
components/Sensors/      # 传感器栅格(预留)
components/TraceTimeline/# 溯源时间线
pages/login/index        # 登录(复刻视觉, 真实 login)
pages/work/index         # 工作台主屏
pages/trace/index        # 近期溯源
pages/me/index           # 我的
pages/batch/index        # 批次详情子页(保留)
api/ai.ts                # aiChat / aiDiagnose (新增)
api/trace.ts             # listTraceEvents (新增)
api/farm.ts              # 复用 + 补 listFields
api/request.ts           # BASE_URL 改 config 读取
config/env.ts            # API base url 配置
```

## 各屏设计

### 工作台主屏（pages/work/index）
从上到下：
1. **渐变头部** — 标题「芍药工作台」+ 基地副标题（取登录用户/首批次 field 信息）。右上网络状态图标（仅 UI 装饰）。
2. **传感器卡片栅格（预留）** — 3 卡（光照度/环境温/土壤湿）静态示例值 + 角标「示例数据」。点击 toast「传感器接入中，敬请期待」。
3. **近期农事看板** — 真实 `GET /farm-records` 倒序，卡片视觉沿用待办看板样式（action/时间/备注/图片）。
4. **快捷指令横滚** — 「AI 诊断」(→相机/诊断流程)、「AI 助手」(→聊天)，几个填充备注模板(复用 FARM_ACTIONS)。「区块链定位」改预留提示。
5. **记一笔表单** — 真实：扫批次码(`Taro.scanCode`)、物料成本/工时输入、农事实录 textarea+快捷标签、图片上传(`Taro.chooseImage`→`POST /uploads`)、可选农资领用、`POST /farm-records`。语音录入按钮→提示「语音录入即将开放」。

### AI 数据流
- **AI 助手对话**：输入文字 → `POST /ai/chat {message}` → 显示 `answer`。无 enabled provider 时后端 400 → catch 显示「AI 服务未配置，请联系管理员」。
- **AI 病害诊断**：`Taro.chooseImage`/拍照 → `POST /uploads` 拿 `url` → `POST /ai/diagnose {imageUrl, note?}` → 显示 `result`。优雅处理 400（需视觉模型）。

### 近期溯源（pages/trace/index）
1. **选批次** — 顶部 chips 列当前用户批次(`GET /batches`)，无批次空态。
2. **溯源链路** — `GET /trace/events/:batchId`，按 `occurredAt` 时间线渲染（origin/farm/harvest/warehouse/logistics/retail 六类型配色+图标），显示 title/actor/location/时间。
3. **区块链存证区（预留）** — 卡片显示「上链哈希」「质检存证」占位 + 角标「区块链接入中」，禁用态。
4. **生成溯源海报** — `Taro.createCanvasContext` 画批次信息海报，`Taro.saveImageToPhotosAlbum` 保存。真功能。

### 我的（pages/me/index）
1. **个人资料卡** — 真实当前用户（用户名/角色/租户）。头像 dicebear 或本地占位。
2. **统计行** — 本月记录数（`GET /farm-records` 统计当月）；合规率/绩效标注示例或省略。
3. **菜单列表**：
   - 蓝牙传感设备配置 → 预留提示
   - 承包地块管理 → 真实 `GET /fields` 只读列表
   - 区块链存证 → 预留提示
   - 系统帮助与客服 → 静态文案
   - 退出登录 → 清 token 跳登录

### 预留位统一处理
所有预留入口视觉完整可见，带「即将开放/接入中」角标，点击统一 toast「功能即将开放」。

## 后端契约（复用现有，不改后端）

| Method | Path | 用途 |
|---|---|---|
| POST | /api/auth/login | 登录 → {accessToken, refreshToken} |
| GET | /api/batches | 批次列表(owner-scoped) |
| GET | /api/fields | 地块列表 |
| GET | /api/farm-records | 农事记录列表 |
| POST | /api/farm-records | 创建农事记录(+可选农资领用) |
| GET | /api/supplies | 农资列表 |
| GET | /api/trace/events/:batchId | 批次溯源事件 |
| POST | /api/uploads | multipart file → {url} |
| POST | /api/ai/chat | {message} → {answer} |
| POST | /api/ai/diagnose | {imageUrl\|imageBase64, note?} → {result} |

相关 shared DTO：`AiChatInput/Response`、`AiDiagnoseInput/Response`、`CreateFarmRecordDto`、`UploadResponse`、`PublicTraceEvent`(参考结构)、`AuthUser`、`TokenPair`。
注：shared 无 batch/field/farm-record/trace-event 的**读**类型，沿用 miniapp 本地接口声明。

## 测试策略

- 重逻辑抽纯函数（base64 处理、时间线分组、当月统计、AI 错误归一），vitest 单测。
- API 层（`api/ai.ts`/`api/trace.ts`/`api/farm.ts`）mock `@tarojs/taro` 的 request 测。
- 页面/视觉靠 `build:weapp` 编译通过 + 手动验证清单。
- 新建 `packages/miniapp/vitest.config.ts` + `@tarojs/taro` mock alias（首个 task 搭好）。

## 风险

1. **Tailwind→SCSS 视觉差距**：渐变/毛玻璃需手调，可能与 web 不像素一致（可接受，移动端独立 UI）。
2. **AI 依赖 enabled provider**：测试需管理员先在 web 后台配 provider；诊断需 visionModel。前端全程优雅降级。
3. **Taro 测试基建从零**：mock `@tarojs/taro` 配 alias，首 task 验证。
4. **图标 SVG weapp 兼容性**：首个 Icon 组件 task 验证（View+background 或 image base64 回退）。
