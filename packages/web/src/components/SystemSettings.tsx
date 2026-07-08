import { useState, useEffect, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, CloudCog, Loader2, Save, ShieldCheck } from 'lucide-react';
import type { OssConfigInput, AiTestResponse } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { getOssConfig, upsertOssConfig, testOssConfig } from '../api/oss-config';
import { fluentButton, fluentFocus, fluentInput, fluentStatusTag } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';

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

const labelCls = 'mb-1 block text-xs font-semibold text-[#605E5C]';
const helpTextCls = 'mt-1 text-xs leading-5 text-[#605E5C]';
const checkboxCls = `h-4 w-4 rounded-[4px] border-[#C8C6C4] text-[#0078D4] accent-[#0078D4] ${fluentFocus}`;

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

  const onSubmit = async (e: FormEvent) => {
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

  return (
    <div className="flex h-full flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <CloudCog className="h-5 w-5 text-[#0078D4]" />
            AI 与存储设置
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
            阿里云 OSS 用于小程序和后台图片上传。未配置或未启用时，服务端继续使用环境变量兜底。
          </p>
        </div>
        <span className={`${fluentStatusTag(form.enabled ? 'active' : 'neutral')} shrink-0`}>
          {form.enabled ? 'OSS 已启用' : '环境变量兜底'}
        </span>
      </div>

      {loading && <LoadingState label="加载 OSS 配置" />}
      {error && (
        <div className="p-5">
          <ErrorState title="OSS 配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" />
        </div>
      )}

      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="fluent-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          <section className="border border-[#E1DFDD] bg-white p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#242424]">OSS 基础配置</h3>
              <p className={helpTextCls}>保存后立即用于后续上传请求；密钥留空时不会覆盖服务端已有密钥。</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="oss-region" className={labelCls}>Region</label>
                <input
                  id="oss-region"
                  className={`${fluentInput} w-full`}
                  value={form.region}
                  onChange={(e) => update('region', e.target.value)}
                  placeholder="oss-cn-hangzhou"
                  required
                />
              </div>
              <div>
                <label htmlFor="oss-bucket" className={labelCls}>Bucket</label>
                <input
                  id="oss-bucket"
                  className={`${fluentInput} w-full`}
                  value={form.bucket}
                  onChange={(e) => update('bucket', e.target.value)}
                  placeholder="my-bucket"
                  required
                />
              </div>
            </div>
          </section>

          <section className="border border-[#E1DFDD] bg-white p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#242424]">访问凭据</h3>
              <p className={helpTextCls}>后台只显示脱敏后的密钥状态，完整密钥仅在保存时提交一次。</p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="oss-access-key-id" className={labelCls}>AccessKeyId</label>
                <input
                  id="oss-access-key-id"
                  className={`${fluentInput} w-full`}
                  value={form.accessKeyId}
                  onChange={(e) => update('accessKeyId', e.target.value)}
                  placeholder="LTAI..."
                  required
                />
              </div>

              <div>
                <label htmlFor="oss-access-key-secret" className={labelCls}>
                  {secretMasked
                    ? `AccessKeySecret（当前 ${secretMasked}，留空不改）`
                    : 'AccessKeySecret'}
                </label>
                <input
                  id="oss-access-key-secret"
                  className={`${fluentInput} w-full`}
                  type="password"
                  value={form.accessKeySecret}
                  onChange={(e) => update('accessKeySecret', e.target.value)}
                  placeholder={secretMasked ? '留空则保持现有密钥' : '请输入 AccessKeySecret'}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label htmlFor="oss-base-url" className={labelCls}>Base URL（可选，自定义访问域名）</label>
                <input
                  id="oss-base-url"
                  className={`${fluentInput} w-full`}
                  value={form.baseUrl}
                  onChange={(e) => update('baseUrl', e.target.value)}
                  placeholder="https://cdn.example.com"
                />
              </div>
            </div>
          </section>

          <section className="border border-[#E1DFDD] bg-[#FAFAFA] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className={`${checkboxCls} mt-0.5 shrink-0`}
              />
              <span>
                <span className="block text-sm font-semibold text-[#242424]">启用 OSS（关闭时回退环境变量）</span>
                <span className="mt-1 block text-xs leading-5 text-[#605E5C]">
                  关闭后不会删除配置，只让服务端继续使用环境变量中的存储配置。
                </span>
              </span>
            </label>
          </section>

          {err && (
            <div role="alert" className="flex items-start gap-2 border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-sm text-[#A4262C]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-[#E1DFDD] pt-4">
            <button type="submit" disabled={submitting} className={fluentButton('primary')}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存配置
            </button>
            <button type="button" onClick={() => void onTest()} disabled={test === 'loading'} className={fluentButton('secondary')}>
              {test === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              测试连接
            </button>

            {saveMsg && (
              <span className={`${fluentStatusTag('success')} gap-1.5`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saveMsg}
              </span>
            )}
            {test === 'loading' && <span className={fluentStatusTag('neutral')}>测试中...</span>}
            {test && test !== 'loading' && test.ok && (
              <span className={`${fluentStatusTag('success')} gap-1.5`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                连接正常 {test.latencyMs ?? '-'}ms
              </span>
            )}
            {test && test !== 'loading' && !test.ok && (
              <span className={`${fluentStatusTag('danger')} gap-1.5`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {test.error ?? '失败'}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
