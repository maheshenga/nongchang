# 子系统 B 实现计划：web 后台 AI 服务商管理 + 系统设置

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 为 web 后台（仅 system_admin）新增 AI 服务商管理页、AI/OSS 设置页与 AI 在线试用面板，全部接子系统 A 的真实后端端点。

**Architecture:** 纯前端。复用 `api/request.ts`（自动 /api 前缀 + Bearer + 401 刷新）、`hooks/useApi.ts`、`auth/auth-context.tsx`、同文件受控 Modal。自定义 tab 导航（非 react-router），菜单是 App.tsx 内按角色数组常量，只往 SYSTEM_ADMIN_NAV 加项即限 system_admin。

**Tech Stack:** React 19, Vite 6, Tailwind v4, lucide-react, motion/react, vitest, @nongchang/shared（已导出 ai.dto 全部 schema/类型）。

**关键约定（全任务通用）：**
- web 命令前缀：`cd /e/code/nongchang`，构建用 `pnpm --filter web build`，测试用 `pnpm --filter web exec vitest run <file>`
- 表单校验沿用「后端校验 + catch 显示 message」，**web 不引入 zod**
- 凭据只显示后端脱敏值（apiKeyMasked/accessKeySecretMasked），编辑留空=不改（提交不传该字段）
- 命名避坑：已存在 `settings` tab（label「系统设置」→ Settings 组件）。新页面用 **不冲突的 id**：`aiProviders`、`aiOssSettings`（label「AI 与存储设置」）
- git 提交身份 `git -c user.name='nongchang' -c user.email='noreply@local'`，禁止 --no-verify、禁止 git config
- 面向用户文本一律中文

---

## Task 1: AI 服务商 API 客户端（TDD）

**Files:**
- Create: `packages/web/src/api/ai-provider.ts`
- Test: `packages/web/src/api/ai-provider.spec.ts`

- [ ] **Step 1: 写失败测试**（照 `api/supply.spec.ts` 风格 mock request）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { listAiProviders, createAiProvider, updateAiProvider, deleteAiProvider, testAiProvider } from './ai-provider';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('ai-provider api client', () => {
  it('listAiProviders GET /ai-providers', async () => {
    await listAiProviders();
    expect(requestMock).toHaveBeenCalledWith('/ai-providers');
  });
  it('createAiProvider POST 带 body', async () => {
    const dto = { name: '通义', baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'qwen-plus' };
    await createAiProvider(dto as any);
    expect(requestMock).toHaveBeenCalledWith('/ai-providers', { method: 'POST', body: JSON.stringify(dto) });
  });
  it('updateAiProvider PATCH /ai-providers/:id,id 编码', async () => {
    await updateAiProvider('a b', { name: 'x' } as any);
    expect(requestMock).toHaveBeenCalledWith('/ai-providers/a%20b', { method: 'PATCH', body: JSON.stringify({ name: 'x' }) });
  });
  it('deleteAiProvider DELETE /ai-providers/:id', async () => {
    await deleteAiProvider('a b');
    expect(requestMock).toHaveBeenCalledWith('/ai-providers/a%20b', { method: 'DELETE' });
  });
  it('testAiProvider POST /ai-providers/:id/test', async () => {
    await testAiProvider('p1');
    expect(requestMock).toHaveBeenCalledWith('/ai-providers/p1/test', { method: 'POST' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang && pnpm --filter web exec vitest run src/api/ai-provider.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
import type { AiProviderView, CreateAiProviderInput, UpdateAiProviderInput, AiTestResponse } from '@nongchang/shared';
import { request } from './request';

export function listAiProviders(): Promise<AiProviderView[]> {
  return request<AiProviderView[]>('/ai-providers');
}
export function createAiProvider(input: CreateAiProviderInput): Promise<AiProviderView> {
  return request<AiProviderView>('/ai-providers', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAiProvider(id: string, input: UpdateAiProviderInput): Promise<AiProviderView> {
  return request<AiProviderView>(`/ai-providers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteAiProvider(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/ai-providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function testAiProvider(id: string): Promise<AiTestResponse> {
  return request<AiTestResponse>(`/ai-providers/${encodeURIComponent(id)}/test`, { method: 'POST' });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang && pnpm --filter web exec vitest run src/api/ai-provider.spec.ts`
Expected: PASS（5 个）。

- [ ] **Step 5: 提交**

```bash
cd /e/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/api/ai-provider.ts packages/web/src/api/ai-provider.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): AI provider API client (TDD)"
```

---

## Task 2: OSS 配置 + AI 业务 API 客户端（TDD）

**Files:**
- Create: `packages/web/src/api/oss-config.ts`
- Create: `packages/web/src/api/ai.ts`
- Test: `packages/web/src/api/oss-config.spec.ts`
- Test: `packages/web/src/api/ai.spec.ts`

- [ ] **Step 1: 写失败测试 oss-config.spec.ts**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { getOssConfig, upsertOssConfig, testOssConfig } from './oss-config';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('oss-config api client', () => {
  it('getOssConfig GET /oss-config', async () => {
    await getOssConfig();
    expect(requestMock).toHaveBeenCalledWith('/oss-config');
  });
  it('upsertOssConfig PUT 带 body', async () => {
    const dto = { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'S' };
    await upsertOssConfig(dto as any);
    expect(requestMock).toHaveBeenCalledWith('/oss-config', { method: 'PUT', body: JSON.stringify(dto) });
  });
  it('testOssConfig POST /oss-config/test', async () => {
    await testOssConfig();
    expect(requestMock).toHaveBeenCalledWith('/oss-config/test', { method: 'POST' });
  });
});
```

- [ ] **Step 2: 写失败测试 ai.spec.ts**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { aiChat, aiDiagnose } from './ai';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('ai api client', () => {
  it('aiChat POST /ai/chat 带 message', async () => {
    await aiChat('你好');
    expect(requestMock).toHaveBeenCalledWith('/ai/chat', { method: 'POST', body: JSON.stringify({ message: '你好' }) });
  });
  it('aiDiagnose POST /ai/diagnose 带 input', async () => {
    await aiDiagnose({ imageBase64: 'AAAA', note: '叶斑' });
    expect(requestMock).toHaveBeenCalledWith('/ai/diagnose', { method: 'POST', body: JSON.stringify({ imageBase64: 'AAAA', note: '叶斑' }) });
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd /e/code/nongchang && pnpm --filter web exec vitest run src/api/oss-config.spec.ts src/api/ai.spec.ts`
Expected: FAIL。

- [ ] **Step 4: 实现 oss-config.ts**

```ts
import type { OssConfigView, OssConfigInput, AiTestResponse } from '@nongchang/shared';
import { request } from './request';

export function getOssConfig(): Promise<OssConfigView | null> {
  return request<OssConfigView | null>('/oss-config');
}
export function upsertOssConfig(input: OssConfigInput): Promise<OssConfigView> {
  return request<OssConfigView>('/oss-config', { method: 'PUT', body: JSON.stringify(input) });
}
export function testOssConfig(): Promise<AiTestResponse> {
  return request<AiTestResponse>('/oss-config/test', { method: 'POST' });
}
```

- [ ] **Step 5: 实现 ai.ts**

```ts
import type { AiChatResponse, AiDiagnoseResponse, AiDiagnoseInput } from '@nongchang/shared';
import { request } from './request';

export function aiChat(message: string): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
}
export function aiDiagnose(input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
  return request<AiDiagnoseResponse>('/ai/diagnose', { method: 'POST', body: JSON.stringify(input) });
}
```

- [ ] **Step 6: 运行确认通过**

Run: `cd /e/code/nongchang && pnpm --filter web exec vitest run src/api/oss-config.spec.ts src/api/ai.spec.ts`
Expected: PASS（5 个）。

- [ ] **Step 7: 提交**

```bash
cd /e/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/api/oss-config.ts packages/web/src/api/ai.ts packages/web/src/api/oss-config.spec.ts packages/web/src/api/ai.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): OSS config + AI chat/diagnose API clients (TDD)"
```

---

## Task 3: AiProviders 组件（列表 + 新增/编辑 Modal + 启用/删除/测试）

**Files:**
- Create: `packages/web/src/components/AiProviders.tsx`

参照 `components/SystemAdmin.tsx` 的列表 + `CreateAgentModal` 模式、`hooks/useApi.ts`、`components/DemoBadge.tsx` 不挂（本页全真实）。

- [ ] **Step 1: 组件骨架（列表 + loading/error）**

```tsx
import { useState } from 'react';
import type { AiProviderView, AiTestResponse } from '@nongchang/shared';
import { listAiProviders, deleteAiProvider, updateAiProvider, testAiProvider } from '../api/ai-provider';
import { useApi } from '../hooks/useApi';
import AiProviderModal from './AiProviderModal'; // 见 Step 3，或同文件内组件
import AiPlayground from './AiPlayground'; // 见 Task 5

export default function AiProviders() {
  const { data, loading, error, reload } = useApi(listAiProviders);
  const [editing, setEditing] = useState<AiProviderView | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, AiTestResponse | 'loading'>>({});

  const onTest = async (id: string) => {
    setTestResult((p) => ({ ...p, [id]: 'loading' }));
    try { setTestResult((p) => ({ ...p, [id]: await testAiProvider(id) })); }
    catch (e) { setTestResult((p) => ({ ...p, [id]: { ok: false, error: e instanceof Error ? e.message : '测试失败' } })); }
  };
  const onToggle = async (p: AiProviderView) => {
    try { await updateAiProvider(p.id, { enabled: !p.enabled }); reload(); }
    catch { /* 行内错误可忽略或 toast */ }
  };
  const onDelete = async (id: string) => {
    if (!window.confirm('确认删除该服务商？')) return;
    try { await deleteAiProvider(id); reload(); } catch { /* toast */ }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">AI 服务商管理</h2>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg" onClick={() => setShowCreate(true)}>新增服务商</button>
      </div>
      {loading && <div className="text-slate-500">加载中…</div>}
      {error && <div className="text-red-500">加载失败：{error.message}<button className="ml-2 underline" onClick={reload}>重试</button></div>}
      {data && (
        <table className="w-full text-sm border rounded-xl overflow-hidden">
          <thead className="bg-slate-50"><tr>
            <th className="p-2 text-left">名称</th><th className="p-2 text-left">baseUrl</th>
            <th className="p-2 text-left">文本模型</th><th className="p-2 text-left">视觉模型</th>
            <th className="p-2 text-left">密钥</th><th className="p-2 text-left">启用</th><th className="p-2 text-left">操作</th>
          </tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-2">{p.name}</td><td className="p-2">{p.baseUrl}</td>
              <td className="p-2">{p.textModel}</td><td className="p-2">{p.visionModel ?? '—'}</td>
              <td className="p-2 font-mono">{p.apiKeyMasked}</td>
              <td className="p-2"><button onClick={() => onToggle(p)} className={p.enabled ? 'text-emerald-600' : 'text-slate-400'}>{p.enabled ? '已启用' : '未启用'}</button></td>
              <td className="p-2 space-x-2">
                <button className="underline" onClick={() => setEditing(p)}>编辑</button>
                <button className="underline" onClick={() => onTest(p.id)}>测试</button>
                <button className="underline text-red-500" onClick={() => onDelete(p.id)}>删除</button>
                {testResult[p.id] === 'loading' && <span className="text-slate-400">测试中…</span>}
                {testResult[p.id] && testResult[p.id] !== 'loading' && (
                  (testResult[p.id] as AiTestResponse).ok
                    ? <span className="text-emerald-600">✓ {(testResult[p.id] as AiTestResponse).latencyMs}ms</span>
                    : <span className="text-red-500">✗ {(testResult[p.id] as AiTestResponse).error}</span>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {(showCreate || editing) && (
        <AiProviderModal
          provider={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={() => { setShowCreate(false); setEditing(null); reload(); }}
        />
      )}
      <AiPlayground />
    </div>
  );
}
```

- [ ] **Step 2: 运行类型检查**

Run: `cd /e/code/nongchang && pnpm --filter web build`
Expected: 此时会因 AiProviderModal / AiPlayground 未实现而失败——下一步实现。可先把 import 注释、占位，或直接进 Step 3 一并实现后再 build。

- [ ] **Step 3: 实现 AiProviderModal（同目录新文件 `components/AiProviderModal.tsx`）**

```tsx
import { useState } from 'react';
import type { AiProviderView, CreateAiProviderInput, UpdateAiProviderInput } from '@nongchang/shared';
import { createAiProvider, updateAiProvider } from '../api/ai-provider';

export default function AiProviderModal({ provider, onClose, onSaved }: {
  provider: AiProviderView | null; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!provider;
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [textModel, setTextModel] = useState(provider?.textModel ?? '');
  const [visionModel, setVisionModel] = useState(provider?.visionModel ?? '');
  const [enabled, setEnabled] = useState(provider?.enabled ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      if (isEdit) {
        const dto: UpdateAiProviderInput = { name, baseUrl, textModel, visionModel: visionModel || undefined, enabled };
        if (apiKey) dto.apiKey = apiKey; // 留空=不改
        await updateAiProvider(provider!.id, dto);
      } else {
        const dto: CreateAiProviderInput = { name, baseUrl, apiKey, textModel, visionModel: visionModel || undefined, enabled };
        await createAiProvider(dto);
      }
      onSaved();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : '保存失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-white rounded-2xl p-6 w-[480px] space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="text-lg font-semibold">{isEdit ? '编辑' : '新增'}服务商</h3>
        {err && <div className="text-red-500 text-sm">{err}</div>}
        <input className="w-full border rounded-lg p-2" placeholder="展示名（如 通义千问）" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="w-full border rounded-lg p-2" placeholder="baseUrl（OpenAI 兼容端点）" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
        <input className="w-full border rounded-lg p-2" placeholder={isEdit ? 'API Key（留空不修改）' : 'API Key'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" />
        <input className="w-full border rounded-lg p-2" placeholder="文本模型（如 qwen-plus）" value={textModel} onChange={(e) => setTextModel(e.target.value)} required />
        <input className="w-full border rounded-lg p-2" placeholder="视觉模型（可选，如 qwen-vl-plus）" value={visionModel} onChange={(e) => setVisionModel(e.target.value)} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />设为启用（同租户仅一个生效）</label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="px-4 py-2 rounded-lg border" onClick={onClose}>取消</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white" disabled={submitting}>{submitting ? '保存中…' : '保存'}</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: build 验证（连同 Task 5 的 AiPlayground 一起，或暂时占位空组件）**

Run: `cd /e/code/nongchang && pnpm --filter web build`
Expected: 若 Task 5 未做，临时建一个 `components/AiPlayground.tsx` 导出 `export default function AiPlayground(){return null;}` 占位，build 通过；Task 5 再补实现。

- [ ] **Step 5: 提交**

```bash
cd /e/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/AiProviders.tsx packages/web/src/components/AiProviderModal.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): AiProviders list + create/edit modal + enable/delete/test"
```

---

## Task 4: SystemSettings 组件（OSS 配置 upsert + 测试连接）

**Files:**
- Create: `packages/web/src/components/SystemSettings.tsx`

- [ ] **Step 1: 实现**

```tsx
import { useState, useEffect } from 'react';
import type { OssConfigView, OssConfigInput, AiTestResponse } from '@nongchang/shared';
import { getOssConfig, upsertOssConfig, testOssConfig } from '../api/oss-config';
import { useApi } from '../hooks/useApi';

export default function SystemSettings() {
  const { data, loading, error, reload } = useApi(getOssConfig);
  const [form, setForm] = useState<OssConfigInput>({ region: '', bucket: '', accessKeyId: '', accessKeySecret: '', baseUrl: '', enabled: false });
  const [secretMasked, setSecretMasked] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [testRes, setTestRes] = useState<AiTestResponse | 'loading' | null>(null);

  useEffect(() => {
    if (data) {
      setForm({ region: data.region, bucket: data.bucket, accessKeyId: data.accessKeyId, accessKeySecret: '', baseUrl: data.baseUrl ?? '', enabled: data.enabled });
      setSecretMasked(data.accessKeySecretMasked);
    }
  }, [data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setSaveMsg(null); setSubmitting(true);
    try {
      const dto: OssConfigInput = { region: form.region, bucket: form.bucket, accessKeyId: form.accessKeyId, baseUrl: form.baseUrl || undefined, enabled: form.enabled };
      if (form.accessKeySecret) dto.accessKeySecret = form.accessKeySecret; // 留空=不改
      await upsertOssConfig(dto);
      setSaveMsg('已保存'); reload();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : '保存失败'); }
    finally { setSubmitting(false); }
  };
  const onTest = async () => {
    setTestRes('loading');
    try { setTestRes(await testOssConfig()); }
    catch (e) { setTestRes({ ok: false, error: e instanceof Error ? e.message : '测试失败' }); }
  };

  return (
    <div className="p-4 max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">AI 与存储设置</h2>
      <p className="text-sm text-slate-500">阿里云 OSS 用于小程序/后台图片上传。未配置或未启用时回退服务器环境变量。</p>
      {loading && <div className="text-slate-500">加载中…</div>}
      {error && <div className="text-red-500">加载失败：{error.message}<button className="ml-2 underline" onClick={reload}>重试</button></div>}
      <form className="space-y-3" onSubmit={save}>
        {err && <div className="text-red-500 text-sm">{err}</div>}
        {saveMsg && <div className="text-emerald-600 text-sm">{saveMsg}</div>}
        <input className="w-full border rounded-lg p-2" placeholder="Region（如 oss-cn-hangzhou）" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} required />
        <input className="w-full border rounded-lg p-2" placeholder="Bucket" value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} required />
        <input className="w-full border rounded-lg p-2" placeholder="AccessKeyId" value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} required />
        <input className="w-full border rounded-lg p-2" type="password" placeholder={secretMasked ? `AccessKeySecret（当前 ${secretMasked}，留空不改）` : 'AccessKeySecret'} value={form.accessKeySecret} onChange={(e) => setForm({ ...form, accessKeySecret: e.target.value })} />
        <input className="w-full border rounded-lg p-2" placeholder="BaseUrl（CDN/自定义域名，可选）" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />启用 OSS（上传走数据库配置）</label>
        <div className="flex items-center gap-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white" disabled={submitting}>{submitting ? '保存中…' : '保存'}</button>
          <button type="button" className="px-4 py-2 rounded-lg border" onClick={onTest}>测试连接</button>
          {testRes === 'loading' && <span className="text-slate-400">测试中…</span>}
          {testRes && testRes !== 'loading' && (testRes.ok ? <span className="text-emerald-600">✓ 连接正常 {testRes.latencyMs}ms</span> : <span className="text-red-500">✗ {testRes.error}</span>)}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: build 验证**

Run: `cd /e/code/nongchang && pnpm --filter web build`
Expected: 编译通过（AiProviders 已存在或 App 尚未挂载本组件均可单独编译）。

- [ ] **Step 3: 提交**

```bash
cd /e/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/SystemSettings.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): SystemSettings OSS config form + test connection"
```

---

## Task 5: AiPlayground 组件（AI 在线试用：对话 + 图片诊断）

**Files:**
- Create/Replace: `packages/web/src/components/AiPlayground.tsx`（Task 3 若建了占位，这里替换实现）

- [ ] **Step 1: 实现**

```tsx
import { useState } from 'react';
import { aiChat, aiDiagnose } from '../api/ai';

export default function AiPlayground() {
  const [msg, setMsg] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const [note, setNote] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [diagErr, setDiagErr] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const sendChat = async () => {
    if (!msg.trim()) return;
    setChatErr(null); setChatLoading(true); setAnswer(null);
    try { setAnswer((await aiChat(msg)).answer); }
    catch (e) { setChatErr(e instanceof Error ? e.message : '对话失败'); }
    finally { setChatLoading(false); }
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result); setImageBase64(s.split(',')[1] ?? s); };
    reader.readAsDataURL(file);
  };
  const sendDiag = async () => {
    if (!imageBase64) { setDiagErr('请先选择图片'); return; }
    setDiagErr(null); setDiagLoading(true); setResult(null);
    try { setResult((await aiDiagnose({ imageBase64, note: note || undefined })).result); }
    catch (e) { setDiagErr(e instanceof Error ? e.message : '诊断失败'); }
    finally { setDiagLoading(false); }
  };

  return (
    <div className="border rounded-2xl p-4 space-y-6 bg-slate-50">
      <h3 className="font-semibold">AI 在线试用</h3>
      <div className="space-y-2">
        <div className="text-sm text-slate-500">文本对话（用当前启用的服务商）</div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg p-2" placeholder="输入问题…" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white" onClick={sendChat} disabled={chatLoading}>{chatLoading ? '发送中…' : '发送'}</button>
          <button type="button" className="px-3 py-2 rounded-lg border text-slate-400" onClick={() => alert('语音输入即将开放')}>🎤</button>
        </div>
        {chatErr && <div className="text-red-500 text-sm">{chatErr}</div>}
        {answer && <div className="bg-white border rounded-lg p-3 text-sm whitespace-pre-wrap">{answer}</div>}
      </div>
      <div className="space-y-2">
        <div className="text-sm text-slate-500">病害诊断（需配置视觉模型）</div>
        <input type="file" accept="image/*" onChange={onPick} />
        <input className="w-full border rounded-lg p-2" placeholder="备注（可选，如部位/症状）" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white" onClick={sendDiag} disabled={diagLoading}>{diagLoading ? '诊断中…' : '开始诊断'}</button>
        {diagErr && <div className="text-red-500 text-sm">{diagErr}</div>}
        {result && <div className="bg-white border rounded-lg p-3 text-sm whitespace-pre-wrap">{result}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: build 验证**

Run: `cd /e/code/nongchang && pnpm --filter web build`
Expected: 编译通过。

- [ ] **Step 3: 提交**

```bash
cd /e/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/components/AiPlayground.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): AI playground (chat + image diagnose) panel"
```

---

## Task 6: App.tsx 接线（菜单 + 懒加载 + 面板挂载）

**Files:**
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: 顶部加 lazy import**（在第 18 行 MerchantManagement 之后）

```tsx
const AiProviders = lazy(() => import('./components/AiProviders'));
const SystemSettings = lazy(() => import('./components/SystemSettings'));
```

- [ ] **Step 2: 扩展 activeTab 联合类型**（第 43 行）

把 `useState<'dashboard' | ... | 'merchantFiles'>('dashboard')` 的联合类型末尾加 `| 'aiProviders' | 'aiOssSettings'`。

- [ ] **Step 3: SYSTEM_ADMIN_NAV 的「移动端与系统」分类加两项**（第 110-115 行 items 内，`settings` 之后）

```tsx
        { id: 'aiProviders', label: 'AI 服务商', icon: Sparkles },
        { id: 'aiOssSettings', label: 'AI 与存储设置', icon: SettingsIcon },
```

（Sparkles、SettingsIcon 已在第 2 行 import，无需新增导入。）

- [ ] **Step 4: 渲染区加两行懒挂载面板**

找到现有 `{mountedTabs.has('warehouse') && <div ...><SystemAdmin /></div>}` 同款的渲染块区域（每个 tab 一行，用 `hidden` 切换可见性）。照同样结构新增：

```tsx
{mountedTabs.has('aiProviders') && (
  <div className={activeTab === 'aiProviders' ? '' : 'hidden'}>
    <Suspense fallback={<ViewSkeleton />}><AiProviders /></Suspense>
  </div>
)}
{mountedTabs.has('aiOssSettings') && (
  <div className={activeTab === 'aiOssSettings' ? '' : 'hidden'}>
    <Suspense fallback={<ViewSkeleton />}><SystemSettings /></Suspense>
  </div>
)}
```

注意：以现有面板的确切包裹写法为准（读 App.tsx 渲染区后照搬其 className/Suspense 包裹方式，保持一致）。

- [ ] **Step 5: build 验证**

Run: `cd /e/code/nongchang && pnpm --filter web build`
Expected: 编译通过，无类型错误。

- [ ] **Step 6: 提交**

```bash
cd /e/code/nongchang
git -c user.name='nongchang' -c user.email='noreply@local' add packages/web/src/App.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): wire AI provider/settings tabs into system admin nav"
```

---

## Task 7: 全量验证

- [ ] **Step 1: web 全量测试**

Run: `cd /e/code/nongchang && pnpm --filter web exec vitest run`
Expected: 全部 PASS（含新增 3 个 API 客户端测试）。

- [ ] **Step 2: web 构建**

Run: `cd /e/code/nongchang && pnpm --filter web build`
Expected: tsc + vite 构建通过。

- [ ] **Step 3: 手动联调检查清单（记录，不阻塞自动化）**

确认（后端 :3001 + web :5173 在跑、已配 APP_ENCRYPTION_KEY）：sysadmin 登录后侧栏出现「AI 服务商」「AI 与存储设置」；非 system_admin 不显示；新增服务商后列表刷新、apiKey 显示脱敏；测试连接返回结果；OSS 设置保存 + 测试；AI 试用面板对话/诊断在无配置时显示后端中文错误而非崩溃。

- [ ] **Step 4: 若有改动则提交**（如联调发现小问题修复）

---

## 完成标准

- 3 个 API 客户端 + 单测通过；AiProviders/SystemSettings/AiPlayground/AiProviderModal 组件齐备；App.tsx 接线仅对 system_admin 暴露。
- 凭据全程脱敏、编辑留空不改；表单错误来自后端 message、不崩溃。
- web `vitest run` 全绿 + `build` 通过。
- 子系统 B 完成后转入子系统 C（Taro 小程序）。
