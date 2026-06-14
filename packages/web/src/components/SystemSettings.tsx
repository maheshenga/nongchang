import { useState, useEffect } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import type { OssConfigInput, AiTestResponse } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { getOssConfig, upsertOssConfig, testOssConfig } from '../api/oss-config';

type TestState = 'loading' | AiTestResponse | null;

interface FormState {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  baseUrl: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  region: '',
  bucket: '',
  accessKeyId: '',
  accessKeySecret: '',
  baseUrl: '',
  enabled: false,
};

export default function SystemSettings() {
  const { data, loading, error, reload } = useApi(getOssConfig);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [secretMasked, setSecretMasked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>(null);

  useEffect(() => {
    if (data) {
      setForm({
        region: data.region,
        bucket: data.bucket,
        accessKeyId: data.accessKeyId,
        accessKeySecret: '',
        baseUrl: data.baseUrl ?? '',
        enabled: data.enabled,
      });
      setSecretMasked(data.accessKeySecretMasked);
    }
  }, [data]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setSaveMsg(null);
    const dto: OssConfigInput = {
      region: form.region.trim(),
      bucket: form.bucket.trim(),
      accessKeyId: form.accessKeyId.trim(),
      baseUrl: form.baseUrl.trim() || undefined,
      enabled: form.enabled,
    };
    // accessKeySecret 仅在用户填了才放进 dto（留空=不改）
    if (form.accessKeySecret.trim()) {
      dto.accessKeySecret = form.accessKeySecret.trim();
    }
    try {
      await upsertOssConfig(dto);
      setSaveMsg('已保存');
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onTest = async () => {
    setTest('loading');
    try {
      const res = await testOssConfig();
      setTest(res);
    } catch (e2) {
      setTest({ ok: false, error: e2 instanceof Error ? e2.message : '测试失败' });
    }
  };

  const inputCls =
    'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition';
  const labelCls = 'block text-xs font-bold text-slate-600 mb-1.5';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50/50">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
          <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
            <HardDrive className="w-4 h-4" />
          </div>
          AI 与存储设置
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          阿里云 OSS 用于小程序/后台图片上传。未配置或未启用时回退服务器环境变量。
        </p>
      </div>

      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && (
        <div className="p-8 text-center text-rose-500 text-sm">
          加载失败：{error}
          <button onClick={() => void reload()} className="underline font-bold ml-2 inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> 重试
          </button>
        </div>
      )}

      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Region</label>
              <input className={inputCls} value={form.region}
                onChange={(e) => update('region', e.target.value)}
                placeholder="oss-cn-hangzhou" required />
            </div>
            <div>
              <label className={labelCls}>Bucket</label>
              <input className={inputCls} value={form.bucket}
                onChange={(e) => update('bucket', e.target.value)}
                placeholder="my-bucket" required />
            </div>
          </div>

          <div>
            <label className={labelCls}>AccessKeyId</label>
            <input className={inputCls} value={form.accessKeyId}
              onChange={(e) => update('accessKeyId', e.target.value)}
              placeholder="LTAI..." required />
          </div>

          <div>
            <label className={labelCls}>
              {secretMasked
                ? `AccessKeySecret（当前 ${secretMasked}，留空不改）`
                : 'AccessKeySecret'}
            </label>
            <input className={inputCls} type="password" value={form.accessKeySecret}
              onChange={(e) => update('accessKeySecret', e.target.value)}
              placeholder={secretMasked ? '留空则保持现有密钥' : '请输入 AccessKeySecret'}
              autoComplete="new-password" />
          </div>

          <div>
            <label className={labelCls}>Base URL（可选，自定义访问域名）</label>
            <input className={inputCls} value={form.baseUrl}
              onChange={(e) => update('baseUrl', e.target.value)}
              placeholder="https://cdn.example.com" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40" />
            <span className="text-sm text-slate-700 font-bold">启用 OSS（关闭时回退环境变量）</span>
          </label>

          {err && <div className="text-sm text-rose-500 font-bold">{err}</div>}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              {submitting ? '保存中…' : '保存'}
            </button>
            <button type="button" onClick={() => void onTest()} disabled={test === 'loading'}
              className="bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-200 px-5 py-2 rounded-lg text-sm font-bold transition-colors">
              测试连接
            </button>
            {saveMsg && <span className="text-sm text-emerald-600 font-bold">{saveMsg}</span>}
            {test === 'loading' && <span className="text-sm text-slate-400">测试中…</span>}
            {test && test !== 'loading' && test.ok && (
              <span className="text-sm text-emerald-600 font-bold">✓ 连接正常 {test.latencyMs ?? '-'}ms</span>
            )}
            {test && test !== 'loading' && !test.ok && (
              <span className="text-sm text-rose-500 font-bold">✗ {test.error ?? '失败'}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
