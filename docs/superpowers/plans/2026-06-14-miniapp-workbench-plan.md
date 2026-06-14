# 子系统 C：Taro 小程序「芍药工作台」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐 task 实现。步骤用 checkbox (`- [ ]`) 跟踪。

**Goal:** 把 Taro 小程序升级为 3 tab「芍药工作台」，视觉照搬 web MobileView，接真实后端 + AI，传感器/区块链作预留入口。

**Architecture:** Taro 4.0.9 + React 18 + TS，weapp。SCSS 主题 + 内联 SVG 图标 + CSS 过渡。3 tab(工作台/近期溯源/我的)。复用现有 NestJS 后端端点，不改后端。

**Tech Stack:** Taro 4.0.9, React 18.3, TypeScript, SCSS, vitest(mock @tarojs/taro)。

**关键约束：** 中文交流；git 用 `-c user.name='nongchang' -c user.email='noreply@local'`，禁 `git config`、禁 `--no-verify`；Write/Edit 每次 < 13000 字符；测试框架 vitest；package 名 `@nongchang/miniapp`。

**已确认决策：** SCSS+Taro 组件；溯源用 `/trace/events/:batchId`；诊断先 upload 再传 imageUrl；预留=可见但禁用+toast；待办看板=真实近期农事(倒序)；离线队列仅 UI 装饰；后端不改。

**构建/测试命令：**
- 编译：`pnpm --filter @nongchang/miniapp build:weapp`
- 测试：`pnpm --filter @nongchang/miniapp exec vitest run <path>`

---

## 任务总览

- Task 1: vitest 测试基建 + @tarojs/taro mock
- Task 2: config/env.ts + request.ts 改造（base url 可配）
- Task 3: api/ai.ts（chat/diagnose）+ AI 错误归一纯函数（TDD）
- Task 4: api/trace.ts（listTraceEvents）+ api/farm.ts 补 listFields（TDD）
- Task 5: utils 纯函数（当月统计/时间线分组/base64）（TDD）
- Task 6: styles/theme.scss 主题系统
- Task 7: components/Icon 内联 SVG 薄封装
- Task 8: app.config.ts tabBar + 页面注册
- Task 9: pages/login 复刻视觉
- Task 10: pages/work 工作台主屏（传感器预留+近期农事+快捷指令）
- Task 11: pages/work 记一笔表单 + AI 对话/诊断接入
- Task 12: components/TraceTimeline + pages/trace 溯源 tab
- Task 13: pages/me 我的 tab + 预留入口
- Task 14: 全量验证（vitest + build:weapp + 手动清单）

---

### Task 1: vitest 测试基建 + @tarojs/taro mock

**Files:**
- Create: `packages/miniapp/vitest.config.ts`
- Create: `packages/miniapp/test/taro-mock.ts`
- Modify: `packages/miniapp/package.json`（devDependencies 加 vitest，scripts 加 test）
- Test: `packages/miniapp/src/store/auth.spec.ts`

- [ ] **Step 1: 加 vitest 依赖与脚本**

修改 `packages/miniapp/package.json`：scripts 增加 `"test": "vitest run"`；devDependencies 增加 `"vitest": "^2.1.9"`（与 web 同版本）。然后在仓库根运行 `pnpm install`。

- [ ] **Step 2: 写 @tarojs/taro mock**

`packages/miniapp/test/taro-mock.ts`：
```ts
import { vi } from 'vitest';

// 内存版 storage
const store = new Map<string, unknown>();

export const taroMock = {
  request: vi.fn(),
  uploadFile: vi.fn(),
  redirectTo: vi.fn(),
  navigateTo: vi.fn(),
  switchTab: vi.fn(),
  showToast: vi.fn(),
  chooseImage: vi.fn(),
  scanCode: vi.fn(),
  getStorageSync: vi.fn((k: string) => store.get(k) ?? ''),
  setStorageSync: vi.fn((k: string, v: unknown) => void store.set(k, v)),
  removeStorageSync: vi.fn((k: string) => void store.delete(k)),
  __reset() {
    store.clear();
    Object.values(this).forEach((f) => {
      if (typeof f === 'function' && 'mockReset' in f) (f as any).mockReset();
    });
  },
};

export default taroMock;
```

- [ ] **Step 3: 写 vitest.config.ts（alias 把 @tarojs/taro 指向 mock）**

`packages/miniapp/vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@tarojs/taro': resolve(__dirname, 'test/taro-mock.ts'),
    },
  },
  test: { environment: 'node' },
});
```

- [ ] **Step 4: 写验证 mock 生效的测试（store/auth）**

`packages/miniapp/src/store/auth.spec.ts`：
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { getToken, setToken, clearToken } from './auth';

describe('store/auth', () => {
  beforeEach(() => (taro as any).__reset());
  it('empty by default', () => expect(getToken()).toBe(''));
  it('set then get', () => { setToken('abc'); expect(getToken()).toBe('abc'); });
  it('clear', () => { setToken('abc'); clearToken(); expect(getToken()).toBe(''); });
});
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/store/auth.spec.ts`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add packages/miniapp/package.json packages/miniapp/vitest.config.ts packages/miniapp/test/taro-mock.ts packages/miniapp/src/store/auth.spec.ts pnpm-lock.yaml
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "test(miniapp): vitest + @tarojs/taro mock infra"
```

---

### Task 2: config/env.ts + request.ts base url 可配

**Files:**
- Create: `packages/miniapp/src/config/env.ts`
- Modify: `packages/miniapp/src/api/request.ts:6`
- Test: `packages/miniapp/src/config/env.spec.ts`

- [ ] **Step 1: 写失败测试**

`packages/miniapp/src/config/env.spec.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { API_BASE_URL } from './env';

describe('config/env', () => {
  it('exposes a non-empty /api base url', () => {
    expect(API_BASE_URL).toMatch(/\/api$/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/config/env.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 env.ts**

`packages/miniapp/src/config/env.ts`：
```ts
// 集中管理 API 地址。开发连本机后端；生产改线上 https 域名并在小程序后台配置合法域名。
// process.env.TARO_APP_API 由 Taro 编译期注入（config/dev.ts / prod.ts 可定义）。
const FALLBACK = 'http://localhost:3001/api';

export const API_BASE_URL: string =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_API) || FALLBACK;
```

- [ ] **Step 4: request.ts 改用 API_BASE_URL**

修改 `packages/miniapp/src/api/request.ts`：删除第 6 行的 `export const BASE_URL = 'http://localhost:3001/api';`，改为：
```ts
import { API_BASE_URL } from '../config/env';
export const BASE_URL = API_BASE_URL;
```
（保留 `BASE_URL` 导出名，下游 uploadFile 等引用不变。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/config/env.spec.ts`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add packages/miniapp/src/config/env.ts packages/miniapp/src/config/env.spec.ts packages/miniapp/src/api/request.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): configurable API base url via config/env"
```

---

### Task 3: api/ai.ts（chat/diagnose）+ AI 错误归一

**Files:**
- Create: `packages/miniapp/src/api/ai.ts`
- Create: `packages/miniapp/src/api/ai.spec.ts`

后端契约：`POST /ai/chat {message}` → `{answer}`；`POST /ai/diagnose {imageUrl?, imageBase64?, note?}` → `{result}`。无 enabled provider 时后端返 400（message 含「未配置」等）。诊断需 visionModel。

- [ ] **Step 1: 写失败测试**

`packages/miniapp/src/api/ai.spec.ts`：
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { aiChat, aiDiagnose, normalizeAiError } from './ai';

const okResp = (data: unknown) => ({ statusCode: 200, data });

describe('api/ai', () => {
  beforeEach(() => (taro as any).__reset());

  it('aiChat posts message and returns answer', async () => {
    (taro.request as any).mockResolvedValue(okResp({ answer: '叶斑病' }));
    const out = await aiChat('番茄叶发黄?');
    expect(out).toBe('叶斑病');
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/ai\/chat$/);
    expect(arg.method).toBe('POST');
    expect(arg.data).toEqual({ message: '番茄叶发黄?' });
  });

  it('aiDiagnose posts imageUrl + note and returns result', async () => {
    (taro.request as any).mockResolvedValue(okResp({ result: '健康' }));
    const out = await aiDiagnose('https://x/i.jpg', '症状3天');
    expect(out).toBe('健康');
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/ai\/diagnose$/);
    expect(arg.data).toEqual({ imageUrl: 'https://x/i.jpg', note: '症状3天' });
  });

  it('aiDiagnose omits note when empty', async () => {
    (taro.request as any).mockResolvedValue(okResp({ result: 'ok' }));
    await aiDiagnose('https://x/i.jpg', '');
    expect((taro.request as any).mock.calls[0][0].data).toEqual({ imageUrl: 'https://x/i.jpg' });
  });

  it('normalizeAiError maps provider-missing to friendly text', () => {
    expect(normalizeAiError(new Error('AI 服务商未配置'))).toBe('AI 服务未配置，请联系管理员');
    expect(normalizeAiError(new Error('boom'))).toBe('boom');
    expect(normalizeAiError('x')).toBe('AI 调用失败');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/api/ai.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 ai.ts**

`packages/miniapp/src/api/ai.ts`：
```ts
import { request } from './request';
import type { AiChatResponse, AiDiagnoseResponse } from '@nongchang/shared';

export async function aiChat(message: string): Promise<string> {
  const res = await request<AiChatResponse>({
    url: '/ai/chat', method: 'POST', data: { message },
  });
  return res.answer;
}

export async function aiDiagnose(imageUrl: string, note?: string): Promise<string> {
  const data: Record<string, unknown> = { imageUrl };
  if (note && note.trim()) data.note = note.trim();
  const res = await request<AiDiagnoseResponse>({
    url: '/ai/diagnose', method: 'POST', data,
  });
  return res.result;
}

// 把后端「未配置 provider/视觉模型」类错误转成用户可读提示。
export function normalizeAiError(e: unknown): string {
  if (e instanceof Error) {
    if (/未配置|provider|视觉模型/i.test(e.message)) return 'AI 服务未配置，请联系管理员';
    return e.message;
  }
  return 'AI 调用失败';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/api/ai.spec.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add packages/miniapp/src/api/ai.ts packages/miniapp/src/api/ai.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): AI chat/diagnose api client + error normalize"
```

---

### Task 4: api/trace.ts + api/farm.ts 补 listFields

**Files:**
- Create: `packages/miniapp/src/api/trace.ts`
- Create: `packages/miniapp/src/api/trace.spec.ts`
- Modify: `packages/miniapp/src/api/farm.ts`（加 Field 接口 + listFields）

后端契约：`GET /trace/events/:batchId` → 事件数组（结构参考 PublicTraceEvent：type/title/actor/location/occurredAt/payload）；`GET /fields` → 地块数组。

- [ ] **Step 1: 写失败测试**

`packages/miniapp/src/api/trace.spec.ts`：
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { listTraceEvents } from './trace';

describe('api/trace', () => {
  beforeEach(() => (taro as any).__reset());
  it('GETs /trace/events/:batchId', async () => {
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: [{ type: 'origin', title: '播种' }] });
    const out = await listTraceEvents('b1');
    expect(out).toHaveLength(1);
    expect((taro.request as any).mock.calls[0][0].url).toMatch(/\/trace\/events\/b1$/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/api/trace.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 trace.ts**

`packages/miniapp/src/api/trace.ts`：
```ts
import { request } from './request';

export interface TraceEvent {
  type: string;
  title: string;
  actor?: string | null;
  location?: string | null;
  occurredAt?: string | null;
  payload?: Record<string, unknown> | null;
}

export function listTraceEvents(batchId: string): Promise<TraceEvent[]> {
  return request<TraceEvent[]>({ url: `/trace/events/${batchId}` });
}
```

- [ ] **Step 4: farm.ts 加 Field + listFields**

在 `packages/miniapp/src/api/farm.ts` 末尾追加：
```ts
export interface Field {
  id: string; ownerId: string; name: string; area: number;
  lng: number; lat: number; iotDeviceId?: string | null;
}
export function listFields(): Promise<Field[]> {
  return request<Field[]>({ url: '/fields' });
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/api/trace.spec.ts`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add packages/miniapp/src/api/trace.ts packages/miniapp/src/api/trace.spec.ts packages/miniapp/src/api/farm.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): trace events api + listFields"
```

---

### Task 5: utils 纯函数（当月统计/时间线分组/AI 图片处理）

**Files:**
- Create: `packages/miniapp/src/utils/stats.ts`
- Create: `packages/miniapp/src/utils/stats.spec.ts`

- [ ] **Step 1: 写失败测试**

`packages/miniapp/src/utils/stats.spec.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { countThisMonth, sortByRecentDesc, traceTypeMeta } from './stats';

describe('utils/stats', () => {
  it('countThisMonth counts records in given year-month', () => {
    const recs = [
      { recordedAt: '2026-06-01T08:00:00Z' },
      { recordedAt: '2026-06-20T08:00:00Z' },
      { recordedAt: '2026-05-30T08:00:00Z' },
    ];
    expect(countThisMonth(recs, new Date('2026-06-14T00:00:00Z'))).toBe(2);
  });

  it('countThisMonth handles empty', () => {
    expect(countThisMonth([], new Date('2026-06-14T00:00:00Z'))).toBe(0);
  });

  it('sortByRecentDesc orders newest first', () => {
    const recs = [
      { recordedAt: '2026-06-01T08:00:00Z', id: 'a' },
      { recordedAt: '2026-06-20T08:00:00Z', id: 'b' },
    ];
    expect(sortByRecentDesc(recs).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('traceTypeMeta returns color+label for known type, fallback for unknown', () => {
    expect(traceTypeMeta('origin').label).toBe('产地');
    expect(traceTypeMeta('zzz').label).toBe('其他');
    expect(typeof traceTypeMeta('farm').color).toBe('string');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/utils/stats.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 stats.ts**

`packages/miniapp/src/utils/stats.ts`：
```ts
interface Dated { recordedAt: string }

export function countThisMonth<T extends Dated>(recs: T[], now: Date): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return recs.filter((r) => {
    const d = new Date(r.recordedAt);
    return d.getUTCFullYear() === y && d.getUTCMonth() === m;
  }).length;
}

export function sortByRecentDesc<T extends Dated>(recs: T[]): T[] {
  return [...recs].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  );
}

const TRACE_META: Record<string, { label: string; color: string }> = {
  origin: { label: '产地', color: '#0ea5e9' },
  farm: { label: '种植', color: '#10b981' },
  harvest: { label: '采收', color: '#f59e0b' },
  warehouse: { label: '仓储', color: '#6366f1' },
  logistics: { label: '物流', color: '#8b5cf6' },
  retail: { label: '零售', color: '#ec4899' },
};

export function traceTypeMeta(type: string): { label: string; color: string } {
  return TRACE_META[type] ?? { label: '其他', color: '#64748b' };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @nongchang/miniapp exec vitest run src/utils/stats.spec.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add packages/miniapp/src/utils/stats.ts packages/miniapp/src/utils/stats.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): stats/trace-meta pure utils (TDD)"
```

---

### Task 6: styles/theme.scss 主题系统

**Files:**
- Create: `packages/miniapp/src/styles/theme.scss`

视觉非单测项，验证靠 `build:weapp` 编译通过 + Task 14 手动核对。

- [ ] **Step 1: 写 theme.scss（颜色变量 + 卡片/渐变/毛玻璃 mixin）**

`packages/miniapp/src/styles/theme.scss`：
```scss
// 芍药工作台主题（emerald）。单位 px，Taro 编译转 rpx。
$c-primary: #059669;       // emerald-600
$c-primary-dark: #065f46;  // emerald-800
$c-accent: #10b981;
$c-bg: #f4f7f6;
$c-card: #ffffff;
$c-text: #1e293b;          // slate-800
$c-text-sub: #64748b;      // slate-500
$c-border: #e2e8f0;        // slate-200
$c-amber: #f59e0b;
$c-rose: #f43f5e;

@mixin card {
  background: $c-card;
  border-radius: 24px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  border: 1px solid $c-border;
}

@mixin gradient-header {
  background: linear-gradient(135deg, $c-primary 0%, $c-primary-dark 100%);
  color: #fff;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
}

@mixin glass {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
}

// 预留角标
@mixin reserved-badge {
  font-size: 20px;
  padding: 2px 12px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  color: $c-amber;
}
```

- [ ] **Step 2: 验证编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 编译成功（theme.scss 仅作为被 import 的部分文件，本步主要确认语法无误；若未被任何页面 import，scss 不会单独编译，可在 Task 9 首次 import 时一并验证）。

- [ ] **Step 3: Commit**

```bash
git add packages/miniapp/src/styles/theme.scss
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): SCSS theme system (emerald 芍药工作台)"
```

---

### Task 7: components/Icon 内联 SVG 薄封装

**Files:**
- Create: `packages/miniapp/src/components/Icon/index.tsx`
- Create: `packages/miniapp/src/components/Icon/index.scss`

weapp 不支持 lucide-react。用 Taro `Image` + `data:image/svg+xml` base64，或简单 emoji/字形回退。本任务用内联 SVG（data URI）方案。

- [ ] **Step 1: 写 Icon 组件**

`packages/miniapp/src/components/Icon/index.tsx`：
```tsx
import { Image } from '@tarojs/components';
import './index.scss';

// 极简 SVG 图标集（stroke 用 currentColor 不生效于 Image，直接内置颜色或用 size/color 重绘）。
// 用法：<Icon name="leaf" size={24} color="#fff" />
const PATHS: Record<string, string> = {
  work: 'M3 7h18v13H3z M8 7V5a4 4 0 0 1 8 0v2',
  trace: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M16 16h2v2h-2z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20a8 8 0 0 1 16 0',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  camera: 'M3 7h4l2-2h6l2 2h4v12H3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sparkles: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  wifi: 'M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01',
  send: 'M3 11l18-8-8 18-2-7-8-3z',
  leaf: 'M5 21c0-9 7-16 16-16 0 9-7 16-16 16z',
};

interface Props { name: keyof typeof PATHS | string; size?: number; color?: string }

export default function Icon({ name, size = 24, color = '#059669' }: Props) {
  const d = PATHS[name] ?? PATHS.work;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return <Image className="nc-icon" src={uri} style={{ width: `${size}px`, height: `${size}px` }} />;
}
```

`packages/miniapp/src/components/Icon/index.scss`：
```scss
.nc-icon { display: inline-block; }
```

- [ ] **Step 2: 验证编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 编译成功（Icon 未被 import 时同样可能不参与编译，Task 9 起被使用后核对渲染）。

- [ ] **Step 3: Commit**

```bash
git add packages/miniapp/src/components/Icon
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): inline-SVG Icon component (lucide replacement)"
```

---

### Task 8: app.config.ts tabBar + 页面注册

**Files:**
- Modify: `packages/miniapp/src/app.config.ts`

- [ ] **Step 1: 改 app.config.ts**

`packages/miniapp/src/app.config.ts`（整体替换）：
```ts
export default {
  pages: [
    'pages/login/index',
    'pages/work/index',
    'pages/trace/index',
    'pages/me/index',
    'pages/batch/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#059669',
    navigationBarTitleText: '芍药工作台',
    navigationBarTextStyle: 'white',
  },
  tabBar: {
    color: '#94a3b8',
    selectedColor: '#059669',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/work/index', text: '工作台' },
      { pagePath: 'pages/trace/index', text: '近期溯源' },
      { pagePath: 'pages/me/index', text: '我的' },
    ],
  },
};
```
注：tabBar 项暂不配 iconPath（需 PNG 资源文件；纯文字 tabBar 合法）。登录页与 batch 详情页不在 tabBar 中（正常）。旧 `pages/index`、`pages/record` 从注册移除（其逻辑将在 Task 10/11 迁入 work 页；文件可后续删除，本任务不删以免编译断裂）。

- [ ] **Step 2: 验证编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: FAIL —— 因为 `pages/work`、`pages/trace`、`pages/me` 尚未创建。这是预期的；Task 9-13 创建后转为成功。**本任务仅提交配置，编译在 Task 13 末整体转正。**

- [ ] **Step 3: Commit**

```bash
git add packages/miniapp/src/app.config.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): 3-tab tabBar shell + page registration"
```

---

### Task 9: pages/login 复刻登录视觉

**Files:**
- Create: `packages/miniapp/src/pages/login/index.scss`
- Modify: `packages/miniapp/src/pages/login/index.tsx`（复刻 MobileView 登录视觉，保留真实 login）
- Create: `packages/miniapp/src/pages/login/index.config.ts`（若不存在）

- [ ] **Step 1: 写 login 页（视觉 + 真实 login）**

`packages/miniapp/src/pages/login/index.tsx` 要点（整体替换现有）：
- 顶部：emerald-teal 渐变圆角 leaf logo（用 `<Icon name="leaf" color="#fff" size={36}/>`），标题「溯源工作台」，副标题「数字生态农业移动管理端 · 让每一次农事都被信任」。
- 表单卡片（`@include card`）：手机号/用户名 `Input`、服务密码 `Input password`。
- 「安全登录」按钮 → 调用现有 `login(username, password)`，成功后 `Taro.switchTab({ url: '/pages/work/index' })`（tabBar 页必须用 switchTab）。
- 失败：`Taro.showToast({ title: e.message, icon: 'none' })`。
- 「申请入驻」为预留：`Taro.showToast({ title: '功能即将开放', icon: 'none' })`。
- 微信一键登录按钮为预留提示。

`index.scss`：`@import '../../styles/theme.scss';` 并实现渐变头、卡片、按钮样式。

`index.config.ts`：
```ts
export default { navigationBarTitleText: '登录', navigationStyle: 'custom' };
```

- [ ] **Step 2: 验证编译（login + theme + Icon 首次联编）**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 仍可能因 work/trace/me 未建而失败；若失败仅因缺页面，可接受。可临时单测 login 是否语法正确：确保无 TS 报错（taro build 输出无 login 相关 error）。

- [ ] **Step 3: Commit**

```bash
git add packages/miniapp/src/pages/login
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): redesign login screen to match workbench visual"
```

---

### Task 10: pages/work 工作台主屏（头部+传感器预留+近期农事+快捷指令）

**Files:**
- Create: `packages/miniapp/src/pages/work/index.tsx`
- Create: `packages/miniapp/src/pages/work/index.scss`
- Create: `packages/miniapp/src/pages/work/index.config.ts`
- Create: `packages/miniapp/src/components/Sensors/index.tsx`
- Create: `packages/miniapp/src/components/Sensors/index.scss`

本任务只做上半屏（不含记一笔表单与 AI，留 Task 11）。先放占位 `<View id="record-anchor"/>`。

- [ ] **Step 1: 写 Sensors 预留组件**

`components/Sensors/index.tsx`：3 列卡片（光照度 15,400 lx / 环境温 24.2 °C / 土壤湿 58.5 %），每卡右上角 `@include reserved-badge` 显示「示例」。整块包一个可点 `View`，`onClick` → `Taro.showToast({ title: '传感器接入中，敬请期待', icon: 'none' })`。
`index.scss`：`@import '../../styles/theme.scss';` 3 列 grid 卡片样式。

- [ ] **Step 2: 写 work 页主体**

`pages/work/index.tsx` 要点：
- `useState` token 守卫：`useDidShow` 里若 `!getToken()` → `Taro.redirectTo({ url: '/pages/login/index' })`。
- 渐变头部（`@include gradient-header`）：标题「芍药工作台」+ 副标题（取首个 field.name 或「基地 A区 · 白芍种植组」占位），右上角 `<Icon name="wifi"/>` 装饰（点击切 `isOffline` 仅 UI）。
- `<Sensors/>` 传感器预留栅格。
- **近期农事看板**：`useDidShow`/`useEffect` 调 `listBatches()` 取首批次或全部，再 `request<FarmRecord[]>({url:'/farm-records'})`，用 `sortByRecentDesc` 取前 5 条卡片渲染（action 徽标 + recordedAt + detail.note + images 缩略）。空态提示「暂无农事记录」。加载/错误态处理。
- **快捷指令横滚**（`ScrollView scrollX`）：「AI 助手」「AI 诊断」「区块链定位(预留)」+ 几个填充模板按钮（复用 FARM_ACTIONS 前几项）。本任务这些按钮先 `Taro.showToast`占位 onClick；真实 AI/记一笔接入在 Task 11 替换。
- 底部占位 `<View id="record-anchor"/>`（Task 11 放表单）。

`index.config.ts`：`export default { navigationBarTitleText: '工作台' };`
`index.scss`：`@import '../../styles/theme.scss';` 实现头部/看板/横滚样式。

- [ ] **Step 3: 验证编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 仍可能因 trace/me 未建失败；确认 work 页本身无 TS/编译 error。

- [ ] **Step 4: Commit**

```bash
git add packages/miniapp/src/pages/work packages/miniapp/src/components/Sensors
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): work tab header + sensor placeholder + recent records"
```

---

### Task 11: pages/work 记一笔表单 + AI 对话/诊断接入

**Files:**
- Modify: `packages/miniapp/src/pages/work/index.tsx`（替换 record-anchor 占位为真实表单 + AI 弹层）
- Modify: `packages/miniapp/src/pages/work/index.scss`

- [ ] **Step 1: 记一笔表单（真实提交）**

在 work 页加入表单区（复用旧 `pages/record` 逻辑）：
- 扫批次码按钮 → `Taro.scanCode()` → 存 `scannedBatchId`（或从近期批次下拉选）。
- 物料成本(元) `Input type=number`、耗用工时(天) `Input type=number`。
- 农事实录 `Textarea` + 快捷标签 chips（FARM_ACTIONS）。
- 语音录入按钮 → `Taro.showToast({ title: '语音录入即将开放', icon: 'none' })`（小程序无 Web Speech）。
- 现场图片：`Taro.chooseImage({count:1})` → `uploadImage(tempFilePath)` 得 url，存入 images 数组并预览。
- 提交按钮「提交上报并上链」→ 组装 `CreateFarmRecordDto`（batchId、fieldId、action、detail:{note,cost,labor}、images、recordedAt:new Date().toISOString()、source:'miniapp'）→ `createFarmRecord(dto)`；成功 `Taro.showToast({title:'已提交', icon:'success'})` 并刷新近期农事；失败 toast。
  - 注：fieldId 需从选中批次取（batch.fieldId）。校验 batchId/action 必填，缺失 toast 阻止提交。

- [ ] **Step 2: AI 对话弹层**

浮动按钮（右下 `<Icon name="mic"/>`，实为文本 AI 入口）或快捷指令「AI 助手」→ 打开弹层 `View`：
- `Textarea` 输入问题 + 「发送」按钮 → `aiChat(text)`；loading 文案「分析中…」；结果 `whitespace` 展示；错误用 `normalizeAiError(e)` toast/内联。
- 关闭按钮收起弹层。

- [ ] **Step 3: AI 诊断弹层**

快捷指令「AI 诊断」→ 弹层：
- 「拍照/选图」`Taro.chooseImage({count:1, sourceType:['camera','album']})` → `uploadImage()` 得 url → 显示预览。
- 备注 `Input`（可选）。
- 「开始诊断」→ `aiDiagnose(url, note)`；loading「识别中…」；结果展示；错误 `normalizeAiError`。

- [ ] **Step 4: 验证编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 同上，work 页无自身 error。

- [ ] **Step 5: Commit**

```bash
git add packages/miniapp/src/pages/work
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): record entry form + AI chat/diagnose on work tab"
```

---

### Task 12: components/TraceTimeline + pages/trace 溯源 tab

**Files:**
- Create: `packages/miniapp/src/components/TraceTimeline/index.tsx`
- Create: `packages/miniapp/src/components/TraceTimeline/index.scss`
- Create: `packages/miniapp/src/pages/trace/index.tsx`
- Create: `packages/miniapp/src/pages/trace/index.scss`
- Create: `packages/miniapp/src/pages/trace/index.config.ts`

- [ ] **Step 1: 写 TraceTimeline 组件**

`components/TraceTimeline/index.tsx`：入参 `events: TraceEvent[]`。按 `occurredAt` 升序渲染时间线，每节点用 `traceTypeMeta(type)` 取 label+color 画圆点+竖线，卡片显示 title/actor/location/格式化时间。空数组渲染空态。

- [ ] **Step 2: 写 trace 页**

`pages/trace/index.tsx` 要点：
- token 守卫（同 work）。
- 顶部渐变头「近期溯源」。
- **选批次**：`listBatches()` → 横滚 chips（batchNo + cropName），选中 `selectedBatchId`，默认选第一个。无批次空态。
- 选中后 `listTraceEvents(selectedBatchId)` → `<TraceTimeline events={...}/>`。加载/错误态。
- **区块链存证区（预留）**：卡片显示「上链哈希 0x····(接入中)」「质检存证(接入中)」，`@include reserved-badge`「区块链接入中」，禁用态，点击 `Taro.showToast({title:'功能即将开放', icon:'none'})`。
- **生成溯源海报**按钮 → `Taro.createCanvasContext` 绘制批次信息海报到 `<Canvas>`，`Taro.canvasToTempFilePath` → `Taro.saveImageToPhotosAlbum`（需授权，失败 toast）。

`index.config.ts`：`export default { navigationBarTitleText: '近期溯源' };`

- [ ] **Step 3: 验证编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 仅 me 页未建可能失败；trace 页本身无 error。

- [ ] **Step 4: Commit**

```bash
git add packages/miniapp/src/pages/trace packages/miniapp/src/components/TraceTimeline
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): trace tab with timeline + blockchain placeholder + poster"
```

---

### Task 13: pages/me 我的 tab + 预留入口

**Files:**
- Create: `packages/miniapp/src/pages/me/index.tsx`
- Create: `packages/miniapp/src/pages/me/index.scss`
- Create: `packages/miniapp/src/pages/me/index.config.ts`

- [ ] **Step 1: 写 me 页**

`pages/me/index.tsx` 要点：
- token 守卫。
- **资料卡**：当前用户信息。token 是 JWT，可解码 payload 取 role/username（用现有 decode 思路：`atob` payload 段；weapp 无 atob，写个 base64 decode 小工具或直接展示占位 + 角色文案）。务实方案：解码失败则展示「农技员」占位。头像用 dicebear url `https://api.dicebear.com/7.x/notionists/svg?seed=Admin`（需配合法域名，编译期不阻断）。
- **统计行**：`request<FarmRecord[]>({url:'/farm-records'})` → `countThisMonth(recs, new Date())` 显示「本月记录」；合规率/绩效显示「示例」角标或「—」。
- **菜单列表**：
  - 蓝牙传感设备配置 → toast「功能即将开放」(预留)
  - 承包地块管理 → `listFields()` 弹层/子区展示只读列表（name/area）
  - 区块链存证 → toast「功能即将开放」(预留)
  - 系统帮助与客服 → 静态文案弹层
  - 退出登录 → `clearToken()` + `Taro.redirectTo({url:'/pages/login/index'})`

`index.config.ts`：`export default { navigationBarTitleText: '我的' };`

- [ ] **Step 2: 全页面联编通过（关键验证点）**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: **成功** —— 此时 work/trace/me 三页齐备，tabBar 引用全部存在，整体编译通过。若失败，定位并修复后再提交。

- [ ] **Step 3: 清理旧页面（可选，确认无引用后）**

确认 `pages/index`、`pages/record` 已不在 app.config 注册且无 import 引用后，删除其目录。再次 `build:weapp` 确认成功。

- [ ] **Step 4: Commit**

```bash
git add packages/miniapp/src/pages/me
git rm -r packages/miniapp/src/pages/index packages/miniapp/src/pages/record 2>/dev/null || true
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): me tab with profile/stats/fields + reserved entries; drop legacy pages"
```

---

### Task 14: 全量验证

**Files:** 无新增。

- [ ] **Step 1: 跑全部小程序单测**

Run: `pnpm --filter @nongchang/miniapp exec vitest run`
Expected: 全绿（auth/env/ai/trace/stats 用例）。

- [ ] **Step 2: 编译**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 成功，无 error。

- [ ] **Step 3: 手动验证清单（微信开发者工具，勾「不校验合法域名」连本机后端）**

确认后端运行 + 已用 sysadmin 在 web 后台配好 enabled AiProvider（含 visionModel）后：
- [ ] 登录页视觉（渐变头/卡片）→ 用 merchantA/password123 登录 → 进工作台
- [ ] 工作台：传感器卡显示「示例」，点击 toast「传感器接入中」
- [ ] 工作台：近期农事加载真实记录
- [ ] 工作台：记一笔（扫码/填写/传图/提交）成功，列表刷新
- [ ] AI 助手：输入问题返回 answer；无 provider 时提示「AI 服务未配置」
- [ ] AI 诊断：选图上传→诊断返回 result
- [ ] 近期溯源：选批次→时间线展示；区块链区禁用+角标；海报生成可保存
- [ ] 我的：资料/本月记录数/地块列表；预留项 toast；退出登录回登录页
- [ ] 3 tab 切换正常

- [ ] **Step 4: 最终提交（如有手动验证修复）**

```bash
git add -A
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "chore(miniapp): subsystem C final verification fixes"
```

---

## Self-Review 结果

- **Spec 覆盖**：登录视觉(T9)、工作台头部/传感器预留(T10)、近期农事(T10)、记一笔(T11)、AI 对话/诊断(T11)、溯源链路+区块链预留+海报(T12)、我的+预留入口(T13)、3-tab 壳(T8)、SCSS 主题(T6)、Icon(T7)、AI/trace/fields API(T3/T4)、纯函数(T5)、测试基建(T1)、env(T2) —— 全覆盖。
- **占位符**：无 TBD/TODO；UI 任务因 Taro 组件难单测，明确以 `build:weapp` + 手动清单验证（已说明理由）。
- **类型一致**：`aiDiagnose(imageUrl, note?)`、`listTraceEvents(batchId)`、`TraceEvent`、`Field`、`countThisMonth/sortByRecentDesc/traceTypeMeta` 跨任务签名一致；`switchTab` 用于 tabBar 页跳转（登录后），`redirectTo` 用于守卫，已区分。
- **风险已记**：AI 依赖 enabled provider（手动清单前置说明）；T8 编译在 T13 末转正（已标注预期失败窗口）。
