import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import type {
  IntegrationProvider,
  TiandituConfigInput,
  WechatConfigInput,
  XfyunConfigInput,
} from '@nongchang/shared';
import {
  getIntegrationConfig,
  upsertTiandituConfig,
  upsertWechatConfig,
  upsertXfyunConfig,
} from '../api/integration';
import { useApi } from '../hooks/useApi';
import { fluentButton, fluentFocus, fluentInput, fluentStatusTag } from '../ui/fluent';
import { registerUnsavedChangesGuard } from '../ui/unsaved-changes';
import { ErrorState, LoadingState } from '../ui/state';
import {
  isIntegrationDirty,
  validateIntegrationDraft,
  type IntegrationDraft,
} from './IntegrationSettings.model';

const fetchWechat = () => getIntegrationConfig('wechat');
const fetchXfyun = () => getIntegrationConfig('xfyun');
const fetchTianditu = () => getIntegrationConfig('tianditu');

const cardClass = 'border border-[#E1DFDD] bg-white';
const cardHeaderClass = 'flex flex-col gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4';
const labelClass = 'mb-1.5 block text-sm font-semibold text-[#323130]';
const helpClass = 'mt-1 text-xs leading-5 text-[#605E5C]';
const checkboxClass = `h-4 w-4 rounded-[4px] border-[#C8C6C4] text-[#0078D4] accent-[#0078D4] ${fluentFocus}`;

type DirtyReporter = (provider: IntegrationProvider, dirty: boolean) => void;

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
  dirty,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  dirty: boolean;
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
        <div className="flex shrink-0 flex-wrap gap-2">
          {dirty && <span className={fluentStatusTag('warning')}>有未保存更改</span>}
          <span className={statusTone(enabled)}>{enabled ? '已启用' : '未启用'}</span>
        </div>
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
      <label htmlFor={htmlFor} className={labelClass}>{label}</label>
      {children}
      {help && <p className={helpClass}>{help}</p>}
    </div>
  );
}

function WechatCard({ onDirtyChange }: { onDirtyChange: DirtyReporter }) {
  const { data, loading, error, reload } = useApi(fetchWechat, { cacheKey: 'integration-wechat' });
  const [baseline, setBaseline] = useState<IntegrationDraft | null>(null);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [secretMasked, setSecretMasked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || error) return;
    const next: IntegrationDraft = {
      provider: 'wechat',
      appId: data?.appId ?? '',
      enabled: data?.enabled ?? false,
      secretChanged: false,
    };
    setAppId(next.appId);
    setEnabled(next.enabled);
    setSecretMasked(data?.secretMasked ?? null);
    setSecret('');
    setBaseline(next);
  }, [data, error, loading]);

  const draft: IntegrationDraft = {
    provider: 'wechat',
    appId,
    enabled,
    secretChanged: Boolean(secret.trim()),
  };
  const dirty = baseline ? isIntegrationDirty(baseline, draft) : false;

  useEffect(() => onDirtyChange('wechat', dirty), [dirty, onDirtyChange]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    const validationErrors = validateIntegrationDraft(draft, Boolean(secretMasked));
    if (validationErrors.length > 0) {
      setFormError(validationErrors.join('；'));
      return;
    }

    const dto: WechatConfigInput = { appId: appId.trim(), enabled };
    if (secret.trim()) dto.secret = secret.trim();
    setSubmitting(true);
    try {
      await upsertWechatConfig(dto);
      await reload();
      setMessage('已保存');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '保存失败');
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
        dirty={dirty}
      />
      {loading && <LoadingState label="加载微信配置" />}
      {error && <div className="p-5"><ErrorState title="微信配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" /></div>}
      {!loading && !error && (
        <form onSubmit={event => void onSubmit(event)} className="space-y-4 p-5">
          <Field label="AppID" htmlFor="wechat-app-id">
            <input id="wechat-app-id" className={`${fluentInput} w-full`} value={appId} onChange={event => setAppId(event.target.value)} placeholder="wx..." required />
          </Field>
          <Field label="AppSecret" htmlFor="wechat-secret" help={secretMasked ? `当前 ${secretMasked}，留空不改` : '首次配置时请输入完整 AppSecret。'}>
            <input
              id="wechat-secret"
              className={`${fluentInput} w-full`}
              type="password"
              value={secret}
              onChange={event => setSecret(event.target.value)}
              placeholder={secretMasked ? '留空则保持现有密钥' : '请输入 AppSecret'}
              autoComplete="new-password"
            />
          </Field>
          <Toggle label="启用微信登录" description="关闭后不会删除配置，只停止小程序微信登录入口。" checked={enabled} onChange={setEnabled} />
          {formError && <InlineError message={formError} />}
          <SaveRow submitting={submitting} label="保存微信配置" message={message} />
        </form>
      )}
    </section>
  );
}

function XfyunCard({ onDirtyChange }: { onDirtyChange: DirtyReporter }) {
  const { data, loading, error, reload } = useApi(fetchXfyun, { cacheKey: 'integration-xfyun' });
  const [baseline, setBaseline] = useState<IntegrationDraft | null>(null);
  const [appId, setAppId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiSecretMasked, setApiSecretMasked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || error) return;
    const next: IntegrationDraft = {
      provider: 'xfyun',
      appId: data?.appId ?? '',
      enabled: data?.enabled ?? false,
      secretChanged: false,
    };
    setAppId(next.appId);
    setEnabled(next.enabled);
    setApiKeyMasked(data?.apiKeyMasked ?? null);
    setApiSecretMasked(data?.apiSecretMasked ?? null);
    setApiKey('');
    setApiSecret('');
    setBaseline(next);
  }, [data, error, loading]);

  const dirtyDraft: IntegrationDraft = {
    provider: 'xfyun',
    appId,
    enabled,
    secretChanged: Boolean(apiKey.trim() || apiSecret.trim()),
  };
  const dirty = baseline ? isIntegrationDirty(baseline, dirtyDraft) : false;

  useEffect(() => onDirtyChange('xfyun', dirty), [dirty, onDirtyChange]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    const credentialsComplete = Boolean(
      (apiKeyMasked || apiKey.trim()) && (apiSecretMasked || apiSecret.trim()),
    );
    const validationErrors = validateIntegrationDraft(
      { ...dirtyDraft, secretChanged: credentialsComplete },
      Boolean(apiKeyMasked && apiSecretMasked),
    );
    if (validationErrors.length > 0) {
      setFormError(validationErrors.join('；'));
      return;
    }

    const dto: XfyunConfigInput = { appId: appId.trim(), enabled };
    if (apiKey.trim()) dto.apiKey = apiKey.trim();
    if (apiSecret.trim()) dto.apiSecret = apiSecret.trim();
    setSubmitting(true);
    try {
      await upsertXfyunConfig(dto);
      await reload();
      setMessage('已保存');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '保存失败');
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
        dirty={dirty}
      />
      {loading && <LoadingState label="加载讯飞配置" />}
      {error && <div className="p-5"><ErrorState title="讯飞配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" /></div>}
      {!loading && !error && (
        <form onSubmit={event => void onSubmit(event)} className="space-y-4 p-5">
          <Field label="APPID" htmlFor="xfyun-app-id">
            <input id="xfyun-app-id" className={`${fluentInput} w-full`} value={appId} onChange={event => setAppId(event.target.value)} placeholder="讯飞应用 APPID" required />
          </Field>
          <Field label="APIKey" htmlFor="xfyun-api-key" help={apiKeyMasked ? `当前 ${apiKeyMasked}，留空不改` : '首次配置时请输入完整 APIKey。'}>
            <input id="xfyun-api-key" className={`${fluentInput} w-full`} type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={apiKeyMasked ? '留空则保持现有 APIKey' : '请输入 APIKey'} autoComplete="new-password" />
          </Field>
          <Field label="APISecret" htmlFor="xfyun-api-secret" help={apiSecretMasked ? `当前 ${apiSecretMasked}，留空不改` : '首次配置时请输入完整 APISecret。'}>
            <input id="xfyun-api-secret" className={`${fluentInput} w-full`} type="password" value={apiSecret} onChange={event => setApiSecret(event.target.value)} placeholder={apiSecretMasked ? '留空则保持现有 APISecret' : '请输入 APISecret'} autoComplete="new-password" />
          </Field>
          <Toggle label="启用讯飞语音转写" description="关闭后小程序录音不会走讯飞转写服务。" checked={enabled} onChange={setEnabled} />
          {formError && <InlineError message={formError} />}
          <SaveRow submitting={submitting} label="保存讯飞配置" message={message} />
        </form>
      )}
    </section>
  );
}

function TiandituCard({ onDirtyChange }: { onDirtyChange: DirtyReporter }) {
  const { data, loading, error, reload } = useApi(fetchTianditu, { cacheKey: 'integration-tianditu' });
  const [baseline, setBaseline] = useState<IntegrationDraft | null>(null);
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || error) return;
    const next: IntegrationDraft = {
      provider: 'tianditu',
      appId: data?.appId ?? '',
      enabled: data?.enabled ?? false,
      secretChanged: false,
    };
    setKey(next.appId);
    setEnabled(next.enabled);
    setBaseline(next);
  }, [data, error, loading]);

  const draft: IntegrationDraft = {
    provider: 'tianditu',
    appId: key,
    enabled,
    secretChanged: false,
  };
  const dirty = baseline ? isIntegrationDirty(baseline, draft) : false;

  useEffect(() => onDirtyChange('tianditu', dirty), [dirty, onDirtyChange]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    const validationErrors = validateIntegrationDraft(draft, true);
    if (validationErrors.length > 0) {
      setFormError(validationErrors.join('；'));
      return;
    }

    const dto: TiandituConfigInput = { key: key.trim(), enabled };
    setSubmitting(true);
    try {
      await upsertTiandituConfig(dto);
      await reload();
      setMessage('已保存');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '保存失败');
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
        dirty={dirty}
      />
      {loading && <LoadingState label="加载天地图配置" />}
      {error && <div className="p-5"><ErrorState title="天地图配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" /></div>}
      {!loading && !error && (
        <form onSubmit={event => void onSubmit(event)} className="space-y-4 p-5">
          <Field label="浏览器端 key" htmlFor="tianditu-key" help="该 key 会暴露给浏览器端 JS API，请在天地图控制台按域名白名单防盗用。">
            <input id="tianditu-key" className={`${fluentInput} w-full`} value={key} onChange={event => setKey(event.target.value)} placeholder="天地图 tk 密钥" required />
          </Field>
          <Toggle label="启用天地图底图" description="关闭后不会删除 key，地图组件按现有兜底策略工作。" checked={enabled} onChange={setEnabled} />
          {formError && <InlineError message={formError} />}
          <SaveRow submitting={submitting} label="保存天地图配置" message={message} />
        </form>
      )}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-3">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className={`${checkboxClass} mt-0.5 shrink-0`}
      />
      <span>
        <span className="block text-sm font-semibold text-[#242424]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#605E5C]">{description}</span>
      </span>
    </label>
  );
}

function SaveRow({ submitting, label, message }: { submitting: boolean; label: string; message: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#E1DFDD] pt-4">
      <button type="submit" disabled={submitting} className={fluentButton('primary')}>
        <Save className="h-4 w-4" />
        {submitting ? '保存中...' : label}
      </button>
      {message && <SavedTag message={message} />}
    </div>
  );
}

export default function IntegrationSettings() {
  const [dirtyByProvider, setDirtyByProvider] = useState<Record<IntegrationProvider, boolean>>({
    wechat: false,
    xfyun: false,
    tianditu: false,
  });
  const hasDirtyChanges = Object.values(dirtyByProvider).some(Boolean);
  const hasDirtyChangesRef = useRef(hasDirtyChanges);
  hasDirtyChangesRef.current = hasDirtyChanges;

  const reportDirty = useCallback<DirtyReporter>((provider, dirty) => {
    setDirtyByProvider(previous => previous[provider] === dirty
      ? previous
      : { ...previous, [provider]: dirty });
  }, []);

  useEffect(() => registerUnsavedChangesGuard(() => hasDirtyChangesRef.current), []);

  useEffect(() => {
    if (!hasDirtyChanges) return undefined;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [hasDirtyChanges]);

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
        <p className="border border-[#E1DFDD] bg-white px-3 py-2 text-xs leading-5 text-[#605E5C]">
          当前后端无独立连接测试；保存后请通过对应登录、转写或地图页面验证。
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
          {hasDirtyChanges && <span className={fluentStatusTag('warning')}>页面有未保存更改</span>}
        </div>
      </div>
      <div className="fluent-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F5F5F5] p-5">
        <WechatCard onDirtyChange={reportDirty} />
        <XfyunCard onDirtyChange={reportDirty} />
        <TiandituCard onDirtyChange={reportDirty} />
      </div>
    </div>
  );
}
