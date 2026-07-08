import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Map,
  MessageCircle,
  Mic,
  Plug,
  Save,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { TiandituConfigInput, WechatConfigInput, XfyunConfigInput } from '@nongchang/shared';
import { getIntegrationConfig, upsertTiandituConfig, upsertWechatConfig, upsertXfyunConfig } from '../api/integration';
import { useApi } from '../hooks/useApi';
import { fluentButton, fluentFocus, fluentInput, fluentStatusTag } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';

const fetchWechat = () => getIntegrationConfig('wechat');
const fetchXfyun = () => getIntegrationConfig('xfyun');
const fetchTianditu = () => getIntegrationConfig('tianditu');

const cardClass = 'border border-[#E1DFDD] bg-white';
const cardHeaderClass = 'flex flex-col gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4';
const labelCls = 'mb-1.5 block text-sm font-semibold text-[#323130]';
const helpCls = 'mt-1 text-xs leading-5 text-[#605E5C]';
const checkboxCls = `h-4 w-4 rounded-[4px] border-[#C8C6C4] text-[#0078D4] accent-[#0078D4] ${fluentFocus}`;

function statusTone(enabled: boolean) {
  return enabled ? fluentStatusTag('active') : fluentStatusTag('neutral');
}

function InlineError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-sm text-[#A4262C]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SavedTag({ message }: { message: string }) {
  return (
    <span className={`${fluentStatusTag('success')} gap-1.5`}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {message}
    </span>
  );
}

function CardHeader({
  icon,
  title,
  description,
  enabled,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
}) {
  return (
    <div className={cardHeaderClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#242424]">
            {icon}
            {title}
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">{description}</p>
        </div>
        <span className={`${statusTone(enabled)} shrink-0`}>
          {enabled ? '已启用' : '未启用'}
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>{label}</label>
      {children}
      {help && <p className={helpCls}>{help}</p>}
    </div>
  );
}

function WechatCard() {
  const { data, loading, error, reload } = useApi(fetchWechat);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [secretMasked, setSecretMasked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setAppId(data.appId ?? '');
      setEnabled(data.enabled);
      setSecretMasked(data.secretMasked);
      setSecret('');
    }
  }, [data]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    const dto: WechatConfigInput = { appId: appId.trim(), enabled };
    if (secret.trim()) dto.secret = secret.trim();
    try {
      await upsertWechatConfig(dto);
      setMsg('已保存');
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section role="region" aria-label="微信小程序登录" className={cardClass}>
      <CardHeader
        icon={<MessageCircle className="h-4 w-4 text-[#0078D4]" />}
        title="微信小程序登录"
        description="配置 AppID/AppSecret 后，小程序可使用微信一键登录。AppID 全局唯一，用于反查租户。"
        enabled={enabled}
      />
      {loading && <LoadingState label="加载微信配置" />}
      {error && (
        <div className="p-5">
          <ErrorState title="微信配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" />
        </div>
      )}
      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 p-5">
          <Field label="AppID" htmlFor="wechat-app-id">
            <input
              id="wechat-app-id"
              className={`${fluentInput} w-full`}
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="wx..."
              required
            />
          </Field>
          <Field
            label="AppSecret"
            htmlFor="wechat-secret"
            help={secretMasked ? `当前 ${secretMasked}，留空不改` : '首次配置时请输入完整 AppSecret。'}
          >
            <input
              id="wechat-secret"
              className={`${fluentInput} w-full`}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={secretMasked ? '留空则保持现有密钥' : '请输入 AppSecret'}
              autoComplete="new-password"
            />
          </Field>
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              aria-label="启用微信登录"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className={`${checkboxCls} mt-0.5 shrink-0`}
            />
            <span>
              <span className="block text-sm font-semibold text-[#242424]">启用微信登录</span>
              <span className="mt-1 block text-xs leading-5 text-[#605E5C]">关闭后不会删除配置，只停止小程序微信登录入口。</span>
            </span>
          </label>
          {err && <InlineError message={err} />}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#E1DFDD] pt-4">
            <button type="submit" disabled={submitting} className={fluentButton('primary')}>
              <Save className="h-4 w-4" />
              {submitting ? '保存中...' : '保存微信配置'}
            </button>
            {msg && <SavedTag message={msg} />}
          </div>
        </form>
      )}
    </section>
  );
}

function XfyunCard() {
  const { data, loading, error, reload } = useApi(fetchXfyun);
  const [appId, setAppId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiSecretMasked, setApiSecretMasked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setAppId(data.appId ?? '');
      setEnabled(data.enabled);
      setApiKeyMasked(data.apiKeyMasked);
      setApiSecretMasked(data.apiSecretMasked);
      setApiKey('');
      setApiSecret('');
    }
  }, [data]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    const dto: XfyunConfigInput = { appId: appId.trim(), enabled };
    if (apiKey.trim()) dto.apiKey = apiKey.trim();
    if (apiSecret.trim()) dto.apiSecret = apiSecret.trim();
    try {
      await upsertXfyunConfig(dto);
      setMsg('已保存');
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section role="region" aria-label="讯飞语音转写" className={cardClass}>
      <CardHeader
        icon={<Mic className="h-4 w-4 text-[#0078D4]" />}
        title="讯飞语音转写"
        description="配置讯飞 APPID/APIKey/APISecret 后，小程序录音将由后端调用讯飞转写，密钥不出后端。"
        enabled={enabled}
      />
      {loading && <LoadingState label="加载讯飞配置" />}
      {error && (
        <div className="p-5">
          <ErrorState title="讯飞配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" />
        </div>
      )}
      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 p-5">
          <Field label="APPID" htmlFor="xfyun-app-id">
            <input
              id="xfyun-app-id"
              className={`${fluentInput} w-full`}
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="讯飞应用 APPID"
              required
            />
          </Field>
          <Field label="APIKey" htmlFor="xfyun-api-key" help={apiKeyMasked ? `当前 ${apiKeyMasked}，留空不改` : '首次配置时请输入完整 APIKey。'}>
            <input
              id="xfyun-api-key"
              className={`${fluentInput} w-full`}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyMasked ? '留空则保持现有 APIKey' : '请输入 APIKey'}
              autoComplete="new-password"
            />
          </Field>
          <Field label="APISecret" htmlFor="xfyun-api-secret" help={apiSecretMasked ? `当前 ${apiSecretMasked}，留空不改` : '首次配置时请输入完整 APISecret。'}>
            <input
              id="xfyun-api-secret"
              className={`${fluentInput} w-full`}
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={apiSecretMasked ? '留空则保持现有 APISecret' : '请输入 APISecret'}
              autoComplete="new-password"
            />
          </Field>
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              aria-label="启用讯飞语音转写"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className={`${checkboxCls} mt-0.5 shrink-0`}
            />
            <span>
              <span className="block text-sm font-semibold text-[#242424]">启用讯飞语音转写</span>
              <span className="mt-1 block text-xs leading-5 text-[#605E5C]">关闭后小程序录音不会走讯飞转写服务。</span>
            </span>
          </label>
          {err && <InlineError message={err} />}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#E1DFDD] pt-4">
            <button type="submit" disabled={submitting} className={fluentButton('primary')}>
              <Save className="h-4 w-4" />
              {submitting ? '保存中...' : '保存讯飞配置'}
            </button>
            {msg && <SavedTag message={msg} />}
          </div>
        </form>
      )}
    </section>
  );
}

function TiandituCard() {
  const { data, loading, error, reload } = useApi(fetchTianditu);
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setKey(data.appId ?? '');
      setEnabled(data.enabled);
    }
  }, [data]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    const dto: TiandituConfigInput = { key: key.trim(), enabled };
    try {
      await upsertTiandituConfig(dto);
      setMsg('已保存');
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section role="region" aria-label="天地图底图" className={cardClass}>
      <CardHeader
        icon={<Map className="h-4 w-4 text-[#0078D4]" />}
        title="天地图底图"
        description="配置浏览器端 key 后，地块管理将以真实底图按经纬度展示地块。"
        enabled={enabled}
      />
      {loading && <LoadingState label="加载天地图配置" />}
      {error && (
        <div className="p-5">
          <ErrorState title="天地图配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" />
        </div>
      )}
      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 p-5">
          <Field
            label="浏览器端 key"
            htmlFor="tianditu-key"
            help="该 key 会暴露给浏览器端 JS API，请在天地图控制台按域名白名单防盗用。"
          >
            <input
              id="tianditu-key"
              className={`${fluentInput} w-full`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="天地图 tk 密钥"
              required
            />
          </Field>
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              aria-label="启用天地图底图"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className={`${checkboxCls} mt-0.5 shrink-0`}
            />
            <span>
              <span className="block text-sm font-semibold text-[#242424]">启用天地图底图</span>
              <span className="mt-1 block text-xs leading-5 text-[#605E5C]">关闭后不会删除 key，地图组件按现有兜底策略工作。</span>
            </span>
          </label>
          {err && <InlineError message={err} />}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#E1DFDD] pt-4">
            <button type="submit" disabled={submitting} className={fluentButton('primary')}>
              <Save className="h-4 w-4" />
              {submitting ? '保存中...' : '保存天地图配置'}
            </button>
            {msg && <SavedTag message={msg} />}
          </div>
        </form>
      )}
    </section>
  );
}

export default function IntegrationSettings() {
  return (
    <div className="flex h-full max-w-4xl flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-col gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
        <div className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
          <Plug className="h-5 w-5 text-[#0078D4]" />
          第三方集成配置
        </div>
        <p className="max-w-3xl text-sm leading-6 text-[#605E5C]">
          管理微信登录、讯飞语音转写与天地图底图凭据。敏感密钥仅在保存时提交，已配置的密钥只显示脱敏状态。
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className={`${fluentStatusTag('neutral')} gap-1.5`}>
            <KeyRound className="h-3.5 w-3.5" />
            密钥留空不覆盖
          </span>
          <span className={`${fluentStatusTag('neutral')} gap-1.5`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            租户内系统管理员配置
          </span>
        </div>
      </div>
      <div className="fluent-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F5F5F5] p-5">
        <WechatCard />
        <XfyunCard />
        <TiandituCard />
      </div>
    </div>
  );
}
