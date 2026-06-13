# Web 后台真实化(de-mock)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `packages/web` 后台从 mock 数据真实化到后端 API(仅 Tier 1:登录/批次/地块/农事/代理商/商家/二维码/溯源事件),Tier 2 屏保留 mock 并加"演示数据"徽标。

**Architecture:** 新增鉴权与数据访问层(`request.ts` 统一 authed fetch + 401 自动刷新、`auth/` 会话状态、域 API 文件、`useApi` hook),各 Tier 1 屏从硬编码数组改为 `useApi(listX)` 取数 + `createX(dto)` 写入后 `reload()`。后端零改动,纯前端消费已上线端点。角色从 JWT 解析,移除演示角色切换下拉。

**Tech Stack:** React 19 + Vite 6 + TypeScript 5.8 + Tailwind 4;Vitest(新引入,纯函数单测);`@nongchang/shared` 提供 DTO/枚举/类型;Vite dev proxy `/api`→localhost:3001。

**关键事实(实现者必读):**
- 后端所有受保护端点走全局 JWT guard(honors `@Public`)+ 全局 Roles guard。Tier 1 端点均需 Bearer access token。
- 登录端点 `POST /api/auth/login` body `{username,password}` → 返回 `{accessToken, refreshToken}`(TokenPair)。刷新 `POST /api/auth/refresh` body `{refreshToken}` → 同样返回 TokenPair。两者均 `@Public`。
- access token 有效期 2h,refresh 7d。access token 的 JWT payload 即 `AuthUser`:`{userId, tenantId, role, agentId, ownerId, iat, exp}`,其中 `role` ∈ `'system_admin'|'agent_admin'|'merchant'`。
- 种子账号(密码均 `password123`):`sysadmin`(system_admin)、`agentA`/`agentB`(agent_admin)、`merchantA`/`merchantB`(merchant)。merchantA 有 1 地块 + 1 批次。
- Tier 1 端点清单(全部前缀 `/api`):
  - `GET /batches`(任意登录角色,按 scope) / `POST /batches`(system_admin|merchant)
  - `GET /fields`(任意) / `POST /fields`(system_admin|merchant)
  - `GET /farm-records`(任意) / `POST /farm-records`(system_admin|merchant)
  - `GET /agents`(system_admin) / `POST /agents`(system_admin) / `GET /agents/merchants`(system_admin|agent_admin)
  - `GET /users`(system_admin|agent_admin) / `POST /users`(system_admin|agent_admin)
  - `POST /trace/codes/:batchId`(system_admin|merchant) / `POST /trace/events`(system_admin|merchant) / `GET /trace/events/:batchId`(任意)
- 后端直接返回 Prisma 模型对象(camelCase 字段,DateTime 序列化为 ISO 字符串)。后端无 PATCH/DELETE/自助注册端点 —— 本期不做编辑/删除/注册。

---

### Task 1: 引入 Vitest 并实现 token-store(TDD)

**Files:**
- Modify: `packages/web/package.json`(加 devDeps + test 脚本)
- Create: `packages/web/vitest.config.ts`
- Create: `packages/web/src/auth/token-store.ts`
- Test: `packages/web/src/auth/token-store.spec.ts`

- [ ] **Step 1: 加 Vitest 依赖与脚本**

编辑 `packages/web/package.json`:在 `scripts` 加一行 `"test": "vitest run"`;在 `devDependencies` 加:
```json
"vitest": "^2.0.5",
"jsdom": "^25.0.0"
```

- [ ] **Step 2: 写 vitest 配置**

创建 `packages/web/vitest.config.ts`(用 jsdom 环境,token-store 需要 localStorage):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
  },
});
```

- [ ] **Step 3: 安装依赖**

Run: `cd E:/code/nongchang && pnpm install`
Expected: 安装完成。注意:本仓库 `.npmrc` 改过 hoisting,`pnpm install` 可能重建 node_modules 并跳过 prisma generate;若后续 backend 报 prisma 错,手动 `cd packages/backend && pnpm prisma generate`(本任务不涉及 backend,可忽略)。

- [ ] **Step 4: 写失败测试**

创建 `packages/web/src/auth/token-store.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTokens, setTokens, clearTokens } from './token-store';

describe('token-store', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no tokens stored', () => {
    expect(getTokens()).toBeNull();
  });

  it('round-trips a token pair', () => {
    setTokens({ accessToken: 'a.b.c', refreshToken: 'r.e.f' });
    expect(getTokens()).toEqual({ accessToken: 'a.b.c', refreshToken: 'r.e.f' });
  });

  it('clearTokens removes stored tokens', () => {
    setTokens({ accessToken: 'a.b.c', refreshToken: 'r.e.f' });
    clearTokens();
    expect(getTokens()).toBeNull();
  });

  it('returns null when only one token present (corrupted state)', () => {
    localStorage.setItem('nc_access_token', 'a.b.c');
    expect(getTokens()).toBeNull();
  });
});
```

- [ ] **Step 5: 跑测试确认失败**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/auth/token-store.spec.ts`
Expected: FAIL("Failed to resolve import './token-store'" 或 函数未定义)

- [ ] **Step 6: 实现 token-store**

创建 `packages/web/src/auth/token-store.ts`:
```ts
import type { TokenPair } from '@nongchang/shared';

const ACCESS_KEY = 'nc_access_token';
const REFRESH_KEY = 'nc_refresh_token';

export function getTokens(): TokenPair | null {
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function setTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/auth/token-store.spec.ts`
Expected: PASS(4 个用例全绿)

- [ ] **Step 8: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/package.json packages/web/vitest.config.ts packages/web/src/auth/token-store.ts packages/web/src/auth/token-store.spec.ts pnpm-lock.yaml
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add vitest + localStorage token-store"
```

---

### Task 2: 实现 decode-token(从 JWT 取 role,TDD)

**Files:**
- Create: `packages/web/src/auth/decode-token.ts`
- Test: `packages/web/src/auth/decode-token.spec.ts`

**说明:** access token 是标准 JWT(三段 base64url,以 `.` 分隔)。中段是 payload,base64url 解码后为 JSON,字段即 `AuthUser`(`userId/tenantId/role/agentId/ownerId`)。此处仅**读取**不验签(验签是后端职责)。浏览器用 `atob` 解码,需先把 base64url 转回标准 base64。

- [ ] **Step 1: 写失败测试**

创建 `packages/web/src/auth/decode-token.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decodeToken } from './decode-token';

// 构造一个 payload 为 {userId,tenantId,role,agentId,ownerId} 的假 JWT
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('decodeToken', () => {
  it('extracts AuthUser fields from a valid token', () => {
    const token = makeJwt({
      userId: 'u1', tenantId: 't1', role: 'merchant',
      agentId: 'ag1', ownerId: 'u1',
    });
    expect(decodeToken(token)).toEqual({
      userId: 'u1', tenantId: 't1', role: 'merchant',
      agentId: 'ag1', ownerId: 'u1',
    });
  });

  it('returns null for a malformed token (not 3 segments)', () => {
    expect(decodeToken('not-a-jwt')).toBeNull();
  });

  it('returns null when payload is not valid JSON', () => {
    expect(decodeToken('aaa.!!!notbase64json!!!.ccc')).toBeNull();
  });

  it('handles agentId/ownerId being null', () => {
    const token = makeJwt({
      userId: 'u2', tenantId: 't1', role: 'system_admin',
      agentId: null, ownerId: null,
    });
    expect(decodeToken(token)).toEqual({
      userId: 'u2', tenantId: 't1', role: 'system_admin',
      agentId: null, ownerId: null,
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/auth/decode-token.spec.ts`
Expected: FAIL("Failed to resolve import './decode-token'")

- [ ] **Step 3: 实现 decode-token**

创建 `packages/web/src/auth/decode-token.ts`:
```ts
import type { AuthUser } from '@nongchang/shared';

export function decodeToken(token: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = JSON.parse(atob(b64)) as Partial<AuthUser>;
    if (typeof json.userId !== 'string' || typeof json.role !== 'string') return null;
    return {
      userId: json.userId,
      tenantId: json.tenantId as string,
      role: json.role as AuthUser['role'],
      agentId: json.agentId ?? null,
      ownerId: json.ownerId ?? null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/auth/decode-token.spec.ts`
Expected: PASS(4 个用例全绿)

- [ ] **Step 5: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/auth/decode-token.ts packages/web/src/auth/decode-token.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add JWT payload decoder (read-only)"
```

---
### Task 3: 实现 request.ts(authed fetch + 401 自动刷新重试一次,TDD)

**Files:**
- Create: `packages/web/src/api/request.ts`
- Test: `packages/web/src/api/request.spec.ts`

**职责:** 唯一碰 fetch + token 的地方。注入 `Authorization: Bearer <access>`;响应 401 时用 refresh token 调 `/api/auth/refresh` 换新 token,重试原请求**一次**;refresh 也 401 → `clearTokens()` + 触发登出回调 + 抛错。用模块级 `refreshing` Promise 防并发(多个 401 共享同一次刷新)。

**契约:**
- `request<T>(path: string, init?: RequestInit): Promise<T>` — path 形如 `/batches`,内部拼 `/api` 前缀;自动注入 Bearer;返回已解析 JSON。
- 非 2xx 抛 `ApiError`(带 `status` 与后端 message)。
- `setOnAuthExpired(cb: () => void)` — 注册"刷新失败需登出"的回调(由 auth-context 注册)。

- [ ] **Step 1: 写失败测试**

创建 `packages/web/src/api/request.spec.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { request, ApiError, setOnAuthExpired } from './request';
import { setTokens, getTokens } from '../auth/token-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  beforeEach(() => {
    localStorage.clear();
    setTokens({ accessToken: 'old-access', refreshToken: 'good-refresh' });
    vi.restoreAllMocks();
  });

  it('injects Bearer token and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);
    const data = await request<{ id: string }[]>('/batches');
    expect(data).toEqual([{ id: 'b1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/batches');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-access');
  });

  it('on 401 refreshes then retries once and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))     // original
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' })) // refresh
      .mockResolvedValueOnce(jsonResponse([{ id: 'b1' }]));                  // retry
    vi.stubGlobal('fetch', fetchMock);
    const data = await request<{ id: string }[]>('/batches');
    expect(data).toEqual([{ id: 'b1' }]);
    expect(getTokens()?.accessToken).toBe('new-access');
    // retry used the new token
    const retryInit = fetchMock.mock.calls[2][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
  });

  it('when refresh also 401, clears tokens, calls onAuthExpired, throws', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))  // original
      .mockResolvedValueOnce(jsonResponse({ message: 'bad' }, 401));     // refresh fails
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/batches')).rejects.toBeInstanceOf(ApiError);
    expect(getTokens()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('throws ApiError with backend message on non-401 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '字段校验失败' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/batches', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 400, message: '字段校验失败' });
  });

  it('concurrent 401s share a single refresh call', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCalls++;
        return Promise.resolve(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }));
      }
      // every non-refresh: first call 401, subsequent (retry) 200
      return Promise.resolve(jsonResponse([], 200));
    });
    // force the two initial requests to 401
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([request('/batches'), request('/fields')]);
    expect(refreshCalls).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/api/request.spec.ts`
Expected: FAIL("Failed to resolve import './request'")

- [ ] **Step 3: 实现 request.ts**

创建 `packages/web/src/api/request.ts`:
```ts
import type { TokenPair } from '@nongchang/shared';
import { getTokens, setTokens, clearTokens } from '../auth/token-store';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(cb: () => void): void {
  onAuthExpired = cb;
}

// 模块级:并发 401 共享同一次刷新
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    onAuthExpired?.();
    return null;
  }
  const pair = (await res.json()) as TokenPair;
  setTokens(pair);
  return pair.accessToken;
}

function refreshAccess(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `请求失败 (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join('; ');
    else if (body.message) message = body.message;
  } catch { /* keep default */ }
  return new ApiError(res.status, message);
}

async function send(path: string, init: RequestInit, accessToken: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`/api${path}`, { ...init, headers });
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = getTokens()?.accessToken ?? null;
  let res = await send(path, init, access);

  if (res.status === 401) {
    const newAccess = await refreshAccess();
    if (!newAccess) throw await parseError(res);
    res = await send(path, init, newAccess);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/api/request.spec.ts`
Expected: PASS(5 个用例全绿)

- [ ] **Step 5: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/api/request.ts packages/web/src/api/request.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add authed fetch wrapper with 401 refresh-retry"
```

---
### Task 4: 域 API 文件(auth/batches/fields/farm-records/agents/users/trace)

**Files:**
- Create: `packages/web/src/api/auth.ts`
- Create: `packages/web/src/api/batches.ts`
- Create: `packages/web/src/api/fields.ts`
- Create: `packages/web/src/api/farm-records.ts`
- Create: `packages/web/src/api/agents.ts`
- Create: `packages/web/src/api/users.ts`
- Modify: `packages/web/src/api/trace.ts`(已有 `fetchPublicTrace`,追加授权端点)

**说明:** 每个域文件只描述端点 + 类型,鉴权全交给 `request.ts`。后端直接返回 Prisma 模型,故各响应接口字段对齐 schema。无单测(这些是薄封装,靠 `tsc` 保证类型契约 + 手动联调)。

- [ ] **Step 1: 写 auth.ts**

创建 `packages/web/src/api/auth.ts`:
```ts
import type { LoginDto, TokenPair } from '@nongchang/shared';

export async function login(dto: LoginDto): Promise<TokenPair> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    let message = '账号或密码错误';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return (await res.json()) as TokenPair;
}
```

- [ ] **Step 2: 写 batches.ts**

创建 `packages/web/src/api/batches.ts`:
```ts
import type { CreateBatchDto } from '@nongchang/shared';
import { request } from './request';

export interface Batch {
  id: string;
  tenantId: string;
  ownerId: string;
  fieldId: string;
  batchNo: string;
  cropName: string;
  plantDate: string;
  expectedHarvest: string;
  status: string;
  createdAt: string;
}

export function listBatches(): Promise<Batch[]> {
  return request<Batch[]>('/batches');
}

export function createBatch(dto: CreateBatchDto): Promise<Batch> {
  return request<Batch>('/batches', { method: 'POST', body: JSON.stringify(dto) });
}
```

- [ ] **Step 3: 写 fields.ts**

创建 `packages/web/src/api/fields.ts`:
```ts
import type { CreateFieldDto } from '@nongchang/shared';
import { request } from './request';

export interface Field {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  area: number;
  iotDeviceId: string | null;
  createdAt: string;
}

export function listFields(): Promise<Field[]> {
  return request<Field[]>('/fields');
}

export function createField(dto: CreateFieldDto): Promise<Field> {
  return request<Field>('/fields', { method: 'POST', body: JSON.stringify(dto) });
}
```

- [ ] **Step 4: 写 farm-records.ts**

创建 `packages/web/src/api/farm-records.ts`:
```ts
import type { CreateFarmRecordDto } from '@nongchang/shared';
import { request } from './request';

export interface FarmRecord {
  id: string;
  tenantId: string;
  batchId: string;
  fieldId: string;
  operatorId: string;
  action: string;
  detail: Record<string, unknown> | null;
  images: string[] | null;
  location: string | null;
  recordedAt: string;
  source: string;
  createdAt: string;
}

export function listFarmRecords(): Promise<FarmRecord[]> {
  return request<FarmRecord[]>('/farm-records');
}

export function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return request<FarmRecord>('/farm-records', { method: 'POST', body: JSON.stringify(dto) });
}
```

- [ ] **Step 5: 写 agents.ts**

创建 `packages/web/src/api/agents.ts`:
```ts
import type { CreateAgentDto } from '@nongchang/shared';
import { request } from './request';

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  region: string;
  status: string;
}

export interface MerchantUser {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
}

export function listAgents(): Promise<Agent[]> {
  return request<Agent[]>('/agents');
}

export function createAgent(dto: CreateAgentDto): Promise<Agent> {
  return request<Agent>('/agents', { method: 'POST', body: JSON.stringify(dto) });
}

export function listMerchants(): Promise<MerchantUser[]> {
  return request<MerchantUser[]>('/agents/merchants');
}
```

- [ ] **Step 6: 写 users.ts**

创建 `packages/web/src/api/users.ts`:
```ts
import type { CreateUserDto } from '@nongchang/shared';
import { request } from './request';

export interface UserListItem {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
  status: string;
}

export interface CreatedUser {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
}

export function listUsers(): Promise<UserListItem[]> {
  return request<UserListItem[]>('/users');
}

export function createUser(dto: CreateUserDto): Promise<CreatedUser> {
  return request<CreatedUser>('/users', { method: 'POST', body: JSON.stringify(dto) });
}
```

- [ ] **Step 7: 追加 trace.ts 授权端点**

编辑 `packages/web/src/api/trace.ts`,在文件末尾追加(保留现有 `fetchPublicTrace` 不动):
```ts
import type { CreateTraceEventDto } from '@nongchang/shared';
import { request } from './request';

export interface TraceCode {
  id: string;
  tenantId: string;
  batchId: string;
  code: string;
  scanCount: number;
  createdAt: string;
}

export interface TraceEvent {
  id: string;
  tenantId: string;
  batchId: string;
  type: string;
  title: string;
  actor: string;
  location: string;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export function generateCode(batchId: string): Promise<TraceCode> {
  return request<TraceCode>(`/trace/codes/${encodeURIComponent(batchId)}`, { method: 'POST' });
}

export function listEvents(batchId: string): Promise<TraceEvent[]> {
  return request<TraceEvent[]>(`/trace/events/${encodeURIComponent(batchId)}`);
}

export function createEvent(dto: CreateTraceEventDto): Promise<TraceEvent> {
  return request<TraceEvent>('/trace/events', { method: 'POST', body: JSON.stringify(dto) });
}
```
注意:`trace.ts` 顶部已有 `import type { PublicTraceResponse } from '@nongchang/shared';`,新加的 `import type { CreateTraceEventDto }` 与 `import { request }` 放在文件已有 import 之后即可(或合并进顶部 import 块)。

- [ ] **Step 8: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(tsc 无错;此时新文件未被任何组件引用,仅验证自身类型正确)

- [ ] **Step 9: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/api/
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add domain API clients for tier-1 endpoints"
```

---
### Task 5: 实现 useApi hook(GET 取数样板,TDD)

**Files:**
- Create: `packages/web/src/hooks/useApi.ts`
- Test: `packages/web/src/hooks/useApi.spec.tsx`

**说明:** 收敛各屏 GET 取数样板,暴露 `{ data, loading, error, reload }`。`fetcher` 是无参 thunk(如 `listBatches`)。用 `@testing-library/react` 的 `renderHook` 测异步状态流转。

- [ ] **Step 1: 加测试依赖**

编辑 `packages/web/package.json` `devDependencies` 追加:
```json
"@testing-library/react": "^16.0.0",
"@testing-library/dom": "^10.4.0"
```
Run: `cd E:/code/nongchang && pnpm install`
Expected: 安装完成。

- [ ] **Step 2: 写失败测试**

创建 `packages/web/src/hooks/useApi.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApi } from './useApi';

describe('useApi', () => {
  it('starts loading, then resolves data', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ id: 'a' }]);
    const { result } = renderHook(() => useApi(fetcher));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 'a' }]);
    expect(result.current.error).toBeNull();
  });

  it('captures error message on rejection', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });

  it('reload re-invokes the fetcher', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }]);
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.reload(); });
    expect(result.current.data).toEqual([{ id: 'b' }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/hooks/useApi.spec.tsx`
Expected: FAIL("Failed to resolve import './useApi'")

- [ ] **Step 4: 实现 useApi**

创建 `packages/web/src/hooks/useApi.ts`:
```ts
import { useState, useEffect, useCallback } from 'react';

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useApi<T>(fetcher: () => Promise<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
    // fetcher 是稳定的模块级函数;若调用方传内联闭包需自行 useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd E:/code/nongchang/packages/web && pnpm test src/hooks/useApi.spec.tsx`
Expected: PASS(3 个用例全绿)

- [ ] **Step 6: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/package.json packages/web/src/hooks/useApi.ts packages/web/src/hooks/useApi.spec.tsx pnpm-lock.yaml
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add useApi data-fetching hook"
```

---

### Task 6: auth-context(React 会话状态)

**Files:**
- Create: `packages/web/src/auth/auth-context.tsx`

**说明:** 把 token-store + decode-token + request 的登出回调组合成 React 会话。提供 `useAuth()` → `{ user, isAuthenticated, login, logout }`。`user` 是 `AuthUser | null`(role 取自 token)。挂载时从已存 token 恢复会话(刷新页面不掉登录);注册 `setOnAuthExpired` 让 401 刷新失败时清空会话。无单测(组合层,靠下游屏手动联调 + tsc)。

- [ ] **Step 1: 实现 auth-context**

创建 `packages/web/src/auth/auth-context.tsx`:
```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser, LoginDto } from '@nongchang/shared';
import { getTokens, setTokens, clearTokens } from './token-store';
import { decodeToken } from './decode-token';
import { login as loginRequest } from '../api/auth';
import { setOnAuthExpired } from '../api/request';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (dto: LoginDto) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const tokens = getTokens();
    return tokens ? decodeToken(tokens.accessToken) : null;
  });

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    // request.ts 刷新失败时回调:清空会话
    setOnAuthExpired(() => setUser(null));
  }, []);

  const login = useCallback(async (dto: LoginDto) => {
    const tokens = await loginRequest(dto);
    setTokens(tokens);
    const decoded = decodeToken(tokens.accessToken);
    if (!decoded) throw new Error('登录令牌无效');
    setUser(decoded);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/auth/auth-context.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add auth-context session state"
```

---
### Task 7: AppLogin 真实登录

**Files:**
- Modify: `packages/web/src/components/AppLogin.tsx`(整体重写表单逻辑;现 onLogin(role) 改为调 auth-context.login)

**说明:** 表单收集 username/password,调 `useAuth().login({username,password})`。成功后 auth-context 内部置 user,App 自动渲染后台(App 改造在 Task 8)。失败展示错误。移除"快捷体验通道"三个角色按钮(`onLogin('system_admin')` 等)。"商户注册"tab 无后端端点 → 隐藏该 tab(只留"系统登录")。`AppLogin` 不再接收 `onLogin` prop。

- [ ] **Step 1: 重写 AppLogin.tsx**

把 `packages/web/src/components/AppLogin.tsx` 整体替换为:
```tsx
import { useState } from 'react';
import { Lock, User, QrCode } from 'lucide-react';
import { useAuth } from '../auth/auth-context';

export default function AppLogin() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1595166669963-c744f9c5d0ba?auto=format&fit=crop&w=1920&q=80')] bg-cover bg-center brightness-[0.2]" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 mx-auto mb-6">
            <QrCode className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">农业溯源 SaaS 平台</h1>
          <p className="text-emerald-100/70 font-medium tracking-wide text-sm">全链路数据上链与数字农业协作</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="mb-8 border-b border-white/10 pb-4">
            <span className="text-sm font-bold text-white border-b-2 border-emerald-400 pb-2">系统登录</span>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">登录账号</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder="请输入用户名"
                  required
                />
                <User className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">密码</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder="••••••••"
                  required
                />
                <Lock className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            {error && <p className="text-rose-400 text-xs font-medium">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] mt-8 disabled:opacity-50"
            >
              {submitting ? '登录中…' : '安全登录'}
            </button>
          </form>
        </div>
        <p className="text-center text-white/30 text-xs mt-8 font-medium">
          &copy; 2026 数字农业溯源系统版. All rights reserved.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查(预期 App.tsx 暂报错)**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: 可能 FAIL —— App.tsx 仍以 `<AppLogin onLogin={handleLogin} />` 调用,而新 AppLogin 不接收 props。这是预期的,Task 8 修复 App.tsx 后即恢复。本步骤只确认 AppLogin.tsx 自身无语法错(报错应仅指向 App.tsx 的 onLogin)。

- [ ] **Step 3: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/AppLogin.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): wire AppLogin to real auth, remove demo role buttons"
```

---

### Task 8: App.tsx 接入会话 + 角色从 token 渲染导航(移除演示切换下拉)

**Files:**
- Modify: `packages/web/src/main.tsx`(包 AuthProvider)
- Modify: `packages/web/src/App.tsx`(用 useAuth、role 从 token、移除角色下拉、登出清 token)

**关键映射:** JWT 的 `role` 取值是 `'system_admin' | 'agent_admin' | 'merchant'`,而现有 `getNavItems()` 的 switch 用的是 `'merchant_admin'`。改造时把 `merchant` 映射到 `MERCHANT_ADMIN_NAV`。

- [ ] **Step 1: main.tsx 包 AuthProvider**

把 `packages/web/src/main.tsx` 替换为:
```tsx
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AuthProvider} from './auth/auth-context';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: App.tsx 顶部引入 useAuth,移除本地角色 state**

编辑 `packages/web/src/App.tsx`:
1. 第 4 行 `import AppLogin from './components/AppLogin';` 后追加一行:
```tsx
import { useAuth } from './auth/auth-context';
```
2. 删除 `import` 块里 `LogOut` 以外不变;保持其余 import 不动。
3. 删除第 41 行 `const [systemRole, setSystemRole] = useState<SystemRole>('system_admin');`。
4. 删除第 38 行 `const [isAuthenticated, setIsAuthenticated] = useState(false);`。
5. 在 `export default function App() {` 之后(原 useState 区域顶部)加:
```tsx
  const { user, isAuthenticated, logout } = useAuth();
  const systemRole: SystemRole | null = user
    ? (user.role === 'merchant' ? 'merchant_admin' : user.role)
    : null;
```

- [ ] **Step 3: App.tsx 改 handleLogin/handleLogout**

把第 76-84 行的 `handleLogin` 与 `handleLogout` 两个函数替换为(删除 `handleLogin`,改 `handleLogout`):
```tsx
  const handleLogout = () => {
    logout();
    setActiveTab('dashboard');
  };
```

- [ ] **Step 4: App.tsx 改 getNavItems 兜底与登录 gate**

1. `getNavItems()`(第 162-169 行)的 switch 保持不变(systemRole 现为 `'system_admin'|'agent_admin'|'merchant_admin'|null`,default 已兜底 SYSTEM_ADMIN_NAV)。把它改为先处理 null:
```tsx
  const getNavItems = () => {
    switch (systemRole) {
      case 'system_admin': return SYSTEM_ADMIN_NAV;
      case 'agent_admin': return AGENT_ADMIN_NAV;
      case 'merchant_admin': return MERCHANT_ADMIN_NAV;
      default: return SYSTEM_ADMIN_NAV;
    }
  };
```
2. 登录 gate(第 177-179 行)改为:
```tsx
  if (!isAuthenticated) {
    return <AppLogin />;
  }
```

- [ ] **Step 5: App.tsx 移除角色切换下拉**

删除第 270-281 行的 `<select ...>...</select>`(三个 `<option>` 的演示角色切换器)。其外层第 266-283 行 `<div className="flex items-center gap-2">` 里仅保留角色徽标 `<span>`(第 267-269 行)。删除后该 div 内只剩徽标 span。

- [ ] **Step 6: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(无 onLogin / systemRole 相关报错)

- [ ] **Step 7: 跑全部单测**

Run: `cd E:/code/nongchang/packages/web && pnpm test`
Expected: PASS(token-store / decode-token / request / useApi 全绿)

- [ ] **Step 8: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/main.tsx packages/web/src/App.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): derive role from JWT, remove demo role switcher"
```

---
### Task 9: BatchAdmin 真实化(列表 + 新建 + 生码)

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.tsx`

**范围决策(实现者必读):** `BatchAdmin.tsx` 是 970 行的演示组件,其 UI 字段(`type/date/house/stage/color/inputCost/laborCost/sellPrice/generated`)与真实 `Batch` 模型(`batchNo/cropName/plantDate/expectedHarvest/status`)不一致。本任务**只换数据层 + 接两个真实写操作**,保留富 UI:
- 用一个 `toViewBatch` 适配器把真实 `Batch` 映射成现有 UI 期望的形状(成本/售价/已生成数等后端无字段的项填 0 或占位)。
- 利润/合规/PDF 排版等模态保持原样在映射数据上运行(后端无对应字段,属屏内演示装饰,不在本期范围)。
- 真实写:新建批次 → `createBatch(dto)`;生码 → `generateCode(batchId)`。
- 移除 `localStorage['system_batches']` 读写、`batches-updated` 事件派发、`farm-record-added` 监听、以及"删除批次"按钮(后端无 DELETE 端点)。

**前置:** 新建批次需要 `ownerId` + `fieldId`(均 uuid)。本任务的新建表单从 `listFields()` 取当前用户地块,用所选 field 的 `id` 作 `fieldId`、其 `ownerId` 作批次 `ownerId`。若用户无地块则提示"请先创建地块"。

- [ ] **Step 1: 替换 imports 与数据源**

编辑 `packages/web/src/components/BatchAdmin.tsx` 顶部。在第 4 行 `import { QRCodeSVG } from 'qrcode.react';` 后追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listBatches, createBatch, type Batch } from '../api/batches';
import { listFields, type Field } from '../api/fields';
import { generateCode } from '../api/trace';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';
```

- [ ] **Step 2: 加适配器 + 用 useApi 取数,删除 mock 与 localStorage**

删除第 6-12 行的 `const MOCK_BATCH_DATA = [...]`。把第 14-23 行(`export default function BatchAdmin() {` 到 `}, [batches]);` 这段 useState+useEffect)替换为:
```tsx
interface ViewBatch {
  id: string;            // 真实 batch.id(生码用)
  code: string;          // 展示用批次号 batchNo
  type: string;          // cropName
  date: string;          // plantDate(YYYY-MM-DD)
  house: string;         // fieldId 简写(无 field 名时回退)
  stage: string;         // status
  color: string;
  inputCost: number;
  laborCost: number;
  sellPrice: number;
  generated: number;
}

const STATUS_COLOR: Record<string, string> = {
  [BatchStatus.PLANTING]: 'cyan',
  [BatchStatus.GROWING]: 'emerald',
  [BatchStatus.HARVESTED]: 'amber',
  [BatchStatus.DISTRIBUTED]: 'indigo',
};

function toViewBatch(b: Batch): ViewBatch {
  return {
    id: b.id,
    code: b.batchNo,
    type: b.cropName,
    date: b.plantDate.slice(0, 10),
    house: b.fieldId.slice(0, 8),
    stage: b.status,
    color: STATUS_COLOR[b.status] ?? 'slate',
    inputCost: 0,
    laborCost: 0,
    sellPrice: 0,
    generated: 0,
  };
}

export default function BatchAdmin() {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches);
  const batches: ViewBatch[] = (rawBatches ?? []).map(toViewBatch);
  const { data: fields } = useApi(listFields);
  const [showCreateModal, setShowCreateModal] = useState(false);
```
注意:此处把原先的 `const [batches, setBatches] = useState(...)` 彻底换成派生只读 `batches`。后续所有 `setBatches(...)` 调用都要删除或改为 `reload()`(见后续步骤)。`filteredData` 的 `useMemo` 依赖里把 `batches` 保留即可(它现在是派生数组)。`b.id` 在筛选里改用 `b.code`(展示号);把第 34 行 `b.id.toLowerCase()` 改为 `b.code.toLowerCase()`。

- [ ] **Step 3: 删除 farm-record-added 监听与成本合并 effect**

删除第 111-138 行整段 `useEffect(() => { const handleFarmRecordAdded ... }, []);`(后端无成本字段,该联动属假总线)。

- [ ] **Step 4: 把新建按钮接真实表单**

删除第 145-161 行的 `handleCreateBatch` 函数。把第 288-291 行的"新建管理批次"按钮的 `onClick={handleCreateBatch}` 改为 `onClick={() => setShowCreateModal(true)}`。

在组件 `return (` 的最外层 `<div ...>` 内、紧接 `{toastMessage && (...)}` 之前(约第 960 行前),插入新建批次模态:
```tsx
      {showCreateModal && (
        <CreateBatchModal
          fields={fields ?? []}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); void reload(); }}
        />
      )}
```

- [ ] **Step 5: 实现 CreateBatchModal(同文件底部)**

在 `BatchAdmin` 函数闭合 `}` 之后、文件末尾,新增组件:
```tsx
function CreateBatchModal({
  fields, onClose, onCreated,
}: {
  fields: Field[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [batchNo, setBatchNo] = useState('');
  const [cropName, setCropName] = useState('');
  const [plantDate, setPlantDate] = useState('');
  const [expectedHarvest, setExpectedHarvest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) { setErr('请选择地块'); return; }
    setSubmitting(true);
    try {
      const dto: CreateBatchDto = {
        ownerId: field.ownerId,
        fieldId: field.id,
        batchNo,
        cropName,
        plantDate: new Date(plantDate).toISOString(),
        expectedHarvest: new Date(expectedHarvest).toISOString(),
        status: BatchStatus.PLANTING,
      };
      await createBatch(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">新建批次</h3>
        {fields.length === 0 && <p className="text-amber-600 text-sm">请先创建地块后再建批次。</p>}
        <label className="block text-xs font-bold text-slate-500">所属地块
          <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-500">批次号
          <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">品种
          <input value={cropName} onChange={(e) => setCropName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">种植日期
          <input type="date" value={plantDate} onChange={(e) => setPlantDate(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">预计收获
          <input type="date" value={expectedHarvest} onChange={(e) => setExpectedHarvest(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600">取消</button>
          <button type="submit" disabled={submitting || fields.length === 0}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
```
注意:`Field` 已由 Step 1 的 import 引入。

- [ ] **Step 6: QR 模态接真实生码 + 删除删除按钮 + 清理 setBatches**

1. 删除第 413-423 行的"删除批次"`<button>`(后端无 DELETE)。
2. 第 716 行 `setBatches(batches.map(b => b.id === showQrModal ? ...))` 与第 750 行同类调用:删除这些 `setBatches(...)` 行(`generated` 是 0 占位,无需本地累加)。
3. 在 QR 模态"导出印刷级 PDF"按钮(第 712-720 行 onClick)里,把 PDF 演示逻辑保留,但在其中**先**调真实生码:把该 onClick 改为:
```tsx
onClick={async () => {
  if (showQrModal) {
    try { await generateCode(showQrModal); } catch { /* 演示导出不阻塞 */ }
  }
  setShowPdfPreview(false);
  setShowQrModal(null);
  showToast(`已为批次生成溯源码并导出标签 (${qrAmount}张)。`);
}}
```
注意:`showQrModal` 现在持有真实 `batch.id`(适配器 `id` 字段),`generateCode` 直接收它。

- [ ] **Step 7: 列表区加 loading/error 态**

把第 338 行 `<div className="flex-1 overflow-auto p-0 min-h-0 bg-slate-50/30">` 内、`<table>` 之前插入:
```tsx
        {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
        {error && (
          <div className="p-8 text-center text-rose-500 text-sm">
            {error} <button onClick={() => void reload()} className="ml-2 underline font-bold">重试</button>
          </div>
        )}
```

- [ ] **Step 8: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(无残留 `setBatches` / `MOCK_BATCH_DATA` / localStorage 引用)

- [ ] **Step 9: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/BatchAdmin.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): real-data BatchAdmin (list/create/generate-code), drop mock bus"
```

---
### Task 10: FarmFields 真实化(列表 + 新建)

**Files:**
- Modify: `packages/web/src/components/FarmFields.tsx`

**范围决策:** `FarmFields.tsx` 用 `INITIAL_FIELDS` 常量数组 + `useState(INITIAL_FIELDS)`,并有 IoT 实时字段(土壤湿度/温度等)无后端支撑。本任务换数据源为 `listFields()`,新建走 `createField(dto)`,IoT 字段保留为**静态展示**(后端无,填占位)。真实 `Field` 模型字段:`id/ownerId/name/area/iotDeviceId/createdAt`。

**前置:** `createField` 需要 `ownerId`(uuid)、`lng/lat`。`ownerId` 取自当前登录用户:merchant 角色用自身 `userId`(从 `useAuth().user.ownerId ?? user.userId`),system_admin 需选一个 merchant(从 `listMerchants()`)。为简化:本任务表单提供"归属商家"下拉(merchant 角色时锁定为自己并隐藏下拉)。

- [ ] **Step 1: 替换 imports 与数据源**

编辑 `packages/web/src/components/FarmFields.tsx`。在顶部 import 区追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listFields, createField, type Field } from '../api/fields';
import { listMerchants, type MerchantUser } from '../api/agents';
import { useAuth } from '../auth/auth-context';
import type { CreateFieldDto } from '@nongchang/shared';
```

- [ ] **Step 2: 删除 INITIAL_FIELDS,改用 useApi**

删除 `const INITIAL_FIELDS = [...]` 整段。把 `const [fields, setFields] = useState(INITIAL_FIELDS);` 与 `const [activeField, setActiveField] = useState(INITIAL_FIELDS[0]);` 替换为:
```tsx
  const { user } = useAuth();
  const { data: rawFields, loading, error, reload } = useApi(listFields);
  const fields: Field[] = rawFields ?? [];
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const activeField = fields.find((f) => f.id === activeFieldId) ?? fields[0] ?? null;
  const [showCreate, setShowCreate] = useState(false);
```
后续模板里凡引用 `activeField.<某 IoT 字段>` 且后端无该字段的,改为静态占位文案(如 `'—'` 或 `'演示数据'`);凡 `activeField.name`/`activeField.area` 用真实字段。把选中地块的点击处理从 `setActiveField(f)` 改为 `setActiveFieldId(f.id)`。

- [ ] **Step 3: 新建按钮 + 模态**

把页面"新增地块"按钮 onClick 改为 `() => setShowCreate(true)`(若组件原本无新增按钮,在标题栏区域加一个)。在组件 return 顶层加:
```tsx
      {showCreate && (
        <CreateFieldModal
          user={user}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void reload(); }}
        />
      )}
```
在列表渲染区前加 loading/error 态:
```tsx
      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
```

- [ ] **Step 4: 实现 CreateFieldModal(文件底部)**

在 `FarmFields` 函数闭合后,文件末尾加:
```tsx
function CreateFieldModal({
  user, onClose, onCreated,
}: {
  user: import('@nongchang/shared').AuthUser | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isMerchant = user?.role === 'merchant';
  const { data: merchants } = useApi(listMerchants);
  const [ownerId, setOwnerId] = useState(isMerchant ? (user?.ownerId ?? user?.userId ?? '') : '');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [lng, setLng] = useState('');
  const [lat, setLat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const dto: CreateFieldDto = {
        ownerId,
        name,
        area: Number(area),
        lng: Number(lng),
        lat: Number(lat),
      };
      await createField(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">新建地块</h3>
        {!isMerchant && (
          <label className="block text-xs font-bold text-slate-500">归属商家
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">请选择…</option>
              {(merchants as MerchantUser[] | null ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}（{m.username}）</option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs font-bold text-slate-500">地块名称
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">面积(亩)
          <input type="number" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold text-slate-500">经度
            <input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} required
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-bold text-slate-500">纬度
            <input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} required
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600">取消</button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(无 INITIAL_FIELDS / setFields 残留)

- [ ] **Step 6: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/FarmFields.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): real-data FarmFields (list/create)"
```

---
### Task 11: FarmRecords 真实化(列表 + 新建)

**Files:**
- Modify: `packages/web/src/components/FarmRecords.tsx`

**范围决策:** `FarmRecords.tsx` 用 `INITIAL_TASKS: RecordTask[]`(字段 `time/batch/type/desc/person/icon/status/material/labor`),与真实 `FarmRecord`(`batchId/fieldId/action/detail/images/location/recordedAt/source`)不一致。换数据源为 `listFarmRecords()`,新建走 `createFarmRecord(dto)`(`source: 'web'`)。`QUICK_TEMPLATES` 保留为纯前端便捷模板。移除 `triggerBatchUpdate` 的 `farm-record-added` 事件派发(假总线)与读 localStorage。甘特/图库/知识图谱视图保持原样在映射数据上运行。

**前置:** `createFarmRecord` 需要 `batchId` + `fieldId`(均 uuid)。新建表单从 `listBatches()` 选批次,用所选 batch 的 `id` 作 `batchId`、其 `fieldId` 作 `fieldId`。

- [ ] **Step 1: 替换 imports 与数据源**

编辑 `packages/web/src/components/FarmRecords.tsx`。第 2 行 `import { useState, useEffect } from 'react';` 后追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listFarmRecords, createFarmRecord, type FarmRecord } from '../api/farm-records';
import { listBatches, type Batch } from '../api/batches';
import { FarmRecordSource, type CreateFarmRecordDto } from '@nongchang/shared';
```

- [ ] **Step 2: 删除 INITIAL_TASKS,改 useApi + 适配器**

删除第 17-21 行的 `const INITIAL_TASKS: RecordTask[] = [...]`。把第 24 行 `const [tasks, setTasks] = useState<RecordTask[]>(INITIAL_TASKS);` 替换为:
```tsx
  const { data: rawRecords, loading, error, reload } = useApi(listFarmRecords);
  const { data: batches } = useApi(listBatches);
  const tasks: RecordTask[] = (rawRecords ?? []).map(toRecordTask);
```
在文件顶部 `RecordTask` 类型定义之后(第 15 行后)加适配器:
```tsx
function toRecordTask(r: FarmRecord): RecordTask {
  return {
    id: r.id,
    time: r.recordedAt.slice(0, 10),
    batch: r.batchId,
    type: r.action,
    desc: typeof r.detail?.desc === 'string' ? r.detail.desc : r.action,
    person: r.operatorId.slice(0, 8),
    icon: undefined,
    status: 'completed',
    material: typeof r.detail?.material === 'string' ? r.detail.material : undefined,
    labor: typeof r.detail?.labor === 'number' ? r.detail.labor : undefined,
  };
}
```
注意:`RecordTask.icon` 现为 `any`,模板里如果对 `task.icon` 调用作组件渲染需做空值兜底(若原代码 `const Icon = task.icon` 后 `<Icon .../>`,改为 `{task.icon && <task.icon .../>}` 或给个默认图标常量)。`status` 现统一为 `'completed'`(后端记录均为已发生)。

- [ ] **Step 3: 移除假总线派发与 localStorage 读**

删除第 63-65 行 `const triggerBatchUpdate = ...`(派发 `farm-record-added`)。删除组件内任何 `localStorage.getItem('system_batches')` 读取(grep 显示第 72 行附近);批次下拉数据改用上面 `useApi(listBatches)` 的 `batches`。删除调用 `triggerBatchUpdate(...)` 与 `window.dispatchEvent(...)`(第 65/115/154 行附近)的语句。

- [ ] **Step 4: handleCreateTask 接真实 POST**

把 `handleCreateTask` 函数体替换为(保留校验提示风格,改为异步真实写):
```tsx
  const handleCreateTask = async () => {
    if (!newTask.type || !newTask.desc || !newTask.batch) {
      return showToast('请输入完整的农事实操信息及批次号');
    }
    const batch = (batches ?? []).find((b) => b.id === newTask.batch);
    if (!batch) return showToast('请选择有效批次');
    try {
      const dto: CreateFarmRecordDto = {
        batchId: batch.id,
        fieldId: batch.fieldId,
        action: newTask.type,
        detail: { desc: newTask.desc, material: newTask.material, labor: newTask.labor },
        recordedAt: new Date().toISOString(),
        source: FarmRecordSource.WEB,
      };
      await createFarmRecord(dto);
      setShowCreateModal(false);
      setNewTask({ type: '', desc: '', material: '', labor: 1, batch: '' });
      showToast('农事记录已保存');
      void reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败');
    }
  };
```

- [ ] **Step 5: 批次下拉用真实批次 + 列表 loading/error**

新建表单里"批次"选择项的 options 改为遍历 `batches`:value 用 `b.id`,展示用 `b.batchNo`:
```tsx
{(batches ?? []).map((b) => <option key={b.id} value={b.id}>{b.batchNo}</option>)}
```
在记录列表渲染区前插入:
```tsx
      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
```

- [ ] **Step 6: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(无 INITIAL_TASKS / setTasks / triggerBatchUpdate / localStorage 残留)

- [ ] **Step 7: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/FarmRecords.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): real-data FarmRecords (list/create), drop event bus"
```

---
### Task 12: 代理商与商家屏真实化(SystemAdmin / AgentPlatform / MerchantManagement)

**Files:**
- Modify: `packages/web/src/components/SystemAdmin.tsx`
- Modify: `packages/web/src/components/AgentPlatform.tsx`
- Modify: `packages/web/src/components/MerchantManagement.tsx`

**范围决策:**
- `SystemAdmin.tsx`:代理商列表 `MOCK_AGENTS`→`listAgents()`,新增代理→`createAgent(dto)`。服务器监控图(`MOCK_SERVER_DATA`)、审批角标、冷库告警等属 Tier 2,**保留 mock**(Task 14 加徽标)。
- `AgentPlatform.tsx`:旗下商家 `SUB_MERCHANTS`→`listMerchants()`。邀请/批量状态切换/注销无后端端点 → 这些按钮改为禁用或提示"待接入",不再改本地数组。
- `MerchantManagement.tsx`:`MOCK_MERCHANTS`→`listMerchants()`,新增商家→`createUser(dto)`(role=merchant)。删除/编辑无端点 → 移除或禁用。

真实模型:`Agent`(`id/name/region/status`)、`MerchantUser`(`id/username/role/agentId/displayName`)。各屏 UI 字段(level/sales/contact/phone/rating 等)后端无 → 适配器填占位。

- [ ] **Step 1: SystemAdmin 代理列表真实化**

编辑 `packages/web/src/components/SystemAdmin.tsx`。第 2 行 `import { Agent } from '../types';` 保留(UI 类型),并在 import 区追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listAgents, createAgent, type Agent as ApiAgent } from '../api/agents';
import type { CreateAgentDto } from '@nongchang/shared';
```
删除第 7-12 行 `const MOCK_AGENTS: Agent[] = [...]`(保留 `MOCK_SERVER_DATA`,它是 Tier 2)。把第 50 行 `const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);` 替换为:
```tsx
  const { data: rawAgents, loading: agentsLoading, error: agentsError, reload: reloadAgents } = useApi(listAgents);
  const agents: Agent[] = (rawAgents ?? []).map(toUiAgent);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
```
在组件函数上方加适配器:
```tsx
function toUiAgent(a: ApiAgent): Agent {
  return {
    id: a.id,
    name: a.name,
    level: '一级代理',
    region: a.region,
    sales: 0,
    status: a.status === 'active' ? 'Active' : 'Inactive',
  };
}
```
注意:`Agent`(from `../types`)的 `status` 联合类型若不含 `'Active'|'Inactive'`,实现者据 `types.ts` 实际定义调整映射值。把任何 `setAgents(...)` 调用删除;批量操作按钮(批改状态/注销)无端点 → 改为提示"待接入"或禁用。新增代理按钮 onClick 设为 `() => setShowCreateAgent(true)`。

- [ ] **Step 2: SystemAdmin 新增代理模态 + loading 态**

在 `SystemAdmin` 闭合后、文件末尾加:
```tsx
function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setSubmitting(true);
    try {
      const dto: CreateAgentDto = { name, region };
      await createAgent(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally { setSubmitting(false); }
  };
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">新增代理商</h3>
        <label className="block text-xs font-bold text-slate-500">名称
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">区域
          <input value={region} onChange={(e) => setRegion(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600">取消</button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
```
在 `SystemAdmin` return 顶层挂载 `{showCreateAgent && <CreateAgentModal onClose={() => setShowCreateAgent(false)} onCreated={() => { setShowCreateAgent(false); void reloadAgents(); }} />}`,并在代理表格前加:
```tsx
      {agentsLoading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {agentsError && <div className="p-8 text-center text-rose-500 text-sm">{agentsError} <button onClick={() => void reloadAgents()} className="underline font-bold ml-2">重试</button></div>}
```

- [ ] **Step 3: AgentPlatform 旗下商家真实化**

编辑 `packages/web/src/components/AgentPlatform.tsx`。第 1 行后追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listMerchants, type MerchantUser } from '../api/agents';
```
删除第 4-8 行 `const SUB_MERCHANTS = [...]`。把第 11 行 `const [merchants, setMerchants] = useState(SUB_MERCHANTS);` 替换为:
```tsx
  const { data: rawMerchants, loading, error, reload } = useApi(listMerchants);
  const merchants = (rawMerchants ?? []).map((m: MerchantUser) => ({
    id: m.id,
    name: m.displayName,
    contact: m.username,
    phone: '—',
    fields: 0,
    area: '—',
    status: 'active',
    joinDate: '—',
  }));
```
删除 `handleBulkAction`/`handleInvite`/`handleAction` 里所有 `setMerchants(...)` 写操作(后端无端点);把这些按钮的 onClick 改为 `() => showToast('该操作待后端接入')`。`filteredMerchants` 的 `m.id.toLowerCase()` 等保留(id 现为 uuid)。列表前加 loading/error:
```tsx
  {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
  {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
```

- [ ] **Step 4: MerchantManagement 真实化(列表 + 新增商家)**

编辑 `packages/web/src/components/MerchantManagement.tsx`。第 3 行后追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listMerchants, type MerchantUser } from '../api/agents';
import { createUser } from '../api/users';
import { Role, type CreateUserDto } from '@nongchang/shared';
```
删除第 15-20 行 `const MOCK_MERCHANTS: Merchant[] = [...]`。把第 23 行 `const [merchants, setMerchants] = useState<Merchant[]>(MOCK_MERCHANTS);` 替换为:
```tsx
  const { data: rawMerchants, loading, error, reload } = useApi(listMerchants);
  const merchants: Merchant[] = (rawMerchants ?? []).map((m: MerchantUser) => ({
    id: m.id,
    name: m.displayName,
    contact: m.username,
    phone: '—',
    location: '—',
    status: 'active' as const,
    joinDate: '—',
    rating: 0,
  }));
```
把 `handleAddSubmit` 替换为调真实 `createUser`(role=merchant):
```tsx
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchant.name || !newMerchant.contact) return;
    try {
      const dto: CreateUserDto = {
        username: newMerchant.contact,
        password: 'password123',
        role: Role.MERCHANT,
        displayName: newMerchant.name,
      };
      await createUser(dto);
      setShowAddModal(false);
      setNewMerchant({ status: 'pending' });
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };
```
注意:新增商家用 `newMerchant.contact` 作 username(后端要求 username≥3 字符)、`newMerchant.name` 作 displayName,密码用占位 `password123`(后端无前端设密流程,本期演示)。删除/编辑按钮(`Trash2`/`Edit`)无端点 → 移除或改提示。列表前加 loading/error 态(同 Step 3 模式)。

- [ ] **Step 5: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(三屏无 MOCK_AGENTS / SUB_MERCHANTS / MOCK_MERCHANTS / setMerchants / setAgents 残留)

- [ ] **Step 6: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/SystemAdmin.tsx packages/web/src/components/AgentPlatform.tsx packages/web/src/components/MerchantManagement.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): real-data agent/merchant screens (list + create)"
```

---

### Task 13: MerchantAdmin 真实化(芍药档案 = 批次形态)

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.tsx`

**范围决策:** `MerchantAdmin.tsx` 把 batch 当 "crop" 档案展示,数据从 `localStorage['system_batches']` 读 + 监听 `batches-updated`(假总线)。改为 `listBatches()`,移除 localStorage 读与事件监听。`Crop` UI 类型(`id/name/batchNo/plantDate/expectedHarvest/qrCodesGenerated/status`)用适配器从真实 `Batch` 映射。本屏无新增(批次新增已在 BatchAdmin),只读。

- [ ] **Step 1: 替换 imports 与数据源**

编辑 `packages/web/src/components/MerchantAdmin.tsx`。第 4 行 `import { Crop } from '../types';` 保留。追加:
```tsx
import { useApi } from '../hooks/useApi';
import { listBatches, type Batch } from '../api/batches';
```
删除第 6-11 行 `const MOCK_CROPS: Crop[] = [...]`。把第 14-53 行(`const [crops, setCrops] = useState<Crop[]>(() => {...})` 整个初始化 + 其下 `useEffect` 监听 `batches-updated`)替换为:
```tsx
function toCrop(b: Batch): Crop {
  return {
    id: b.id,
    name: b.cropName,
    batchNo: b.batchNo,
    plantDate: b.plantDate.slice(0, 10),
    expectedHarvest: b.expectedHarvest.slice(0, 10),
    qrCodesGenerated: 0,
    status: b.status as Crop['status'],
  };
}

export default function MerchantAdmin() {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches);
  const crops: Crop[] = (rawBatches ?? []).map(toCrop);
```
注意:删除原 `export default function MerchantAdmin() {` 旧行(已被上面的合并替换)。后续任何 `setCrops(...)` 调用删除(只读屏)。`filteredCrops` 等保留。

- [ ] **Step 2: 列表 loading/error 态**

在 crop 列表渲染区前插入:
```tsx
      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
```

- [ ] **Step 3: 类型检查**

Run: `cd E:/code/nongchang/packages/web && pnpm lint`
Expected: PASS(无 MOCK_CROPS / setCrops / localStorage / batches-updated 残留)

- [ ] **Step 4: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/MerchantAdmin.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): real-data MerchantAdmin (batches as crop profiles)"
```

---
### Task 14: Tier 2 屏"演示数据 / 待接入"徽标

**Files:**
- Create: `packages/web/src/components/DemoBadge.tsx`
- Modify: `packages/web/src/components/Dashboard.tsx`(顶部加徽标)
- Modify: `packages/web/src/components/LogisticsTracker.tsx`
- Modify: `packages/web/src/components/RfidMonitor.tsx`
- Modify: `packages/web/src/components/AntiFakeMonitor.tsx`
- Modify: `packages/web/src/components/D3GeoMap.tsx`
- Modify: `packages/web/src/components/HeatmapD3.tsx`

**说明:** Tier 2 屏(分析图表、物流、仓储/RFID、防伪、地图)无后端端点,本期保留 mock 数据,但顶部加统一徽标明确标注"演示数据 / 待接入"。SystemAdmin 的服务器监控区(`MOCK_SERVER_DATA`)也属 Tier 2,在该区块上方加徽标。

- [ ] **Step 1: 实现 DemoBadge 组件**

创建 `packages/web/src/components/DemoBadge.tsx`:
```tsx
import { Info } from 'lucide-react';

export default function DemoBadge({ note }: { note?: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">
      <Info className="w-3.5 h-3.5" />
      演示数据 / 待接入{note ? ` · ${note}` : ''}
    </div>
  );
}
```

- [ ] **Step 2: 在各 Tier 2 屏顶部挂载徽标**

对以下每个文件,在 import 区加 `import DemoBadge from './DemoBadge';`,并在组件最外层容器的起始处(标题区附近)插入 `<DemoBadge />`:
- `Dashboard.tsx`
- `LogisticsTracker.tsx`
- `RfidMonitor.tsx`
- `AntiFakeMonitor.tsx`
- `D3GeoMap.tsx`
- `HeatmapD3.tsx`

并在 `SystemAdmin.tsx` 的服务器监控图区块(渲染 `MOCK_SERVER_DATA` 的 `<AreaChart>` 所在卡片)标题处插入 `<DemoBadge note="服务器监控" />`(SystemAdmin 已在 Task 12 引入,这里只需 import DemoBadge)。

注意:`D3GeoMap.tsx` / `HeatmapD3.tsx` 若为纯画布渲染组件且无外层标题容器,把 `<DemoBadge />` 包在最外 `<div>` 顶部即可。

- [ ] **Step 3: 类型检查 + 构建**

Run: `cd E:/code/nongchang/packages/web && pnpm lint && pnpm build`
Expected: PASS(tsc 无错,vite build 成功产出 dist)

- [ ] **Step 4: 提交**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/DemoBadge.tsx packages/web/src/components/Dashboard.tsx packages/web/src/components/LogisticsTracker.tsx packages/web/src/components/RfidMonitor.tsx packages/web/src/components/AntiFakeMonitor.tsx packages/web/src/components/D3GeoMap.tsx packages/web/src/components/HeatmapD3.tsx packages/web/src/components/SystemAdmin.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): add demo-data badge to tier-2 screens"
```

---

### Task 15: 全量验证(构建 + 单测 + 后端不回归)

**Files:** 无新增(验证任务)

- [ ] **Step 1: web 单测全绿**

Run: `cd E:/code/nongchang/packages/web && pnpm test`
Expected: PASS(token-store 4 + decode-token 4 + request 5 + useApi 3 = 16 用例全绿)

- [ ] **Step 2: web 类型检查 + 构建**

Run: `cd E:/code/nongchang/packages/web && pnpm lint && pnpm build`
Expected: PASS(tsc 全绿,vite build 产出 dist)

- [ ] **Step 3: shared + backend 构建不回归**

Run: `cd E:/code/nongchang && pnpm --filter @nongchang/shared build && pnpm --filter backend build`
Expected: PASS(两包构建成功)

- [ ] **Step 4: 后端测试不回归**

Run: `cd E:/code/nongchang/packages/backend && pnpm test`
Expected: PASS(43/43,需 Docker PostgreSQL `nongchang-postgis` 在 localhost:5432 运行;若未启动,先 `docker start nongchang-postgis` 等健康后再跑)

- [ ] **Step 5: 手动联调清单(human-in-loop,非自动化)**

启动后端 + web dev,逐项确认(对照 spec 验收标准):
1. `cd packages/backend && pnpm start:dev`(确保已 seed:`pnpm prisma:seed`)。
2. `cd packages/web && pnpm dev`,浏览器开 dev 地址。
3. 用 `sysadmin / password123` 登录 → 导航显示 system_admin 三类菜单;代理商列表为真实 seed(西南大区代理/华东大区代理);新增代理后列表刷新可见。
4. 退出,用 `merchantA / password123` 登录 → 导航为 merchant 菜单;地块显示 A区露地、批次显示 PA-2026-001;新建地块/批次/农事记录走真实 POST,刷新可见;批次生码调真实端点。
5. 用 `agentA / password123` 登录 → 旗下商家列表显示真实 merchant。
6. 刷新页面不掉登录;手动删除 localStorage 的 `nc_access_token` 后操作 → 触发 refresh;删除两 token → 跳登录。
7. Tier 2 屏(Dashboard/物流/RFID/防伪/地图)顶部有"演示数据/待接入"徽标。
8. 确认 `localStorage` 不再有 `system_batches` 键。

- [ ] **Step 6: 最终提交(如手动联调有微调)**

```bash
cd E:/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' status
# 若有联调修正:
git -c user.name='nongchang' -c user.email='noreply@local' add -A
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(web): manual integration adjustments"
```

---
