import { useState, useEffect } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import type { WechatConfigInput, XfyunConfigInput } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { getIntegrationConfig, upsertWechatConfig, upsertXfyunConfig } from '../api/integration';

const fetchWechat = () => getIntegrationConfig('wechat');
const fetchXfyun = () => getIntegrationConfig('xfyun');

const inputCls =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition';
const labelCls = 'block text-xs font-bold text-slate-600 mb-1.5';
const btnPrimary =
  'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm';

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setErr(null); setMsg(null);
    const dto: WechatConfigInput = { appId: appId.trim(), enabled };
    if (secret.trim()) dto.secret = secret.trim();
    try {
      await upsertWechatConfig(dto);
      setMsg('已保存'); await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50/50">
        <h3 className="font-bold text-slate-800 text-base">微信小程序登录</h3>
        <p className="text-xs text-slate-500 mt-1">配置 AppID/AppSecret 后,小程序方可使用「微信一键登录」。AppID 全局唯一,用于反查租户。</p>
      </div>
      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && (
        <div className="p-8 text-center text-rose-500 text-sm">
          加载失败:{error}
          <button onClick={() => void reload()} className="underline font-bold ml-2 inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> 重试
          </button>
        </div>
      )}
      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="p-5 space-y-4">
          <div>
            <label className={labelCls}>AppID</label>
            <input className={inputCls} value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="wx..." required />
          </div>
          <div>
            <label className={labelCls}>{secretMasked ? `AppSecret(当前 ${secretMasked},留空不改)` : 'AppSecret'}</label>
            <input className={inputCls} type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder={secretMasked ? '留空则保持现有密钥' : '请输入 AppSecret'} autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40" />
            <span className="text-sm text-slate-700 font-bold">启用微信登录</span>
          </label>
          {err && <div className="text-sm text-rose-500 font-bold">{err}</div>}
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? '保存中…' : '保存'}</button>
            {msg && <span className="text-sm text-emerald-600 font-bold">{msg}</span>}
          </div>
        </form>
      )}
    </div>
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
      setApiKey(''); setApiSecret('');
    }
  }, [data]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setErr(null); setMsg(null);
    const dto: XfyunConfigInput = { appId: appId.trim(), enabled };
    if (apiKey.trim()) dto.apiKey = apiKey.trim();
    if (apiSecret.trim()) dto.apiSecret = apiSecret.trim();
    try {
      await upsertXfyunConfig(dto);
      setMsg('已保存'); await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50/50">
        <h3 className="font-bold text-slate-800 text-base">讯飞语音(语音录入)</h3>
        <p className="text-xs text-slate-500 mt-1">配置讯飞 APPID/APIKey/APISecret 后,小程序录音将由后端调用讯飞转写,密钥不出后端。</p>
      </div>
      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && (
        <div className="p-8 text-center text-rose-500 text-sm">
          加载失败:{error}
          <button onClick={() => void reload()} className="underline font-bold ml-2 inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> 重试
          </button>
        </div>
      )}
      {!loading && !error && (
        <form onSubmit={(e) => void onSubmit(e)} className="p-5 space-y-4">
          <div>
            <label className={labelCls}>APPID</label>
            <input className={inputCls} value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="讯飞应用 APPID" required />
          </div>
          <div>
            <label className={labelCls}>{apiKeyMasked ? `APIKey(当前 ${apiKeyMasked},留空不改)` : 'APIKey'}</label>
            <input className={inputCls} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyMasked ? '留空则保持现有' : '请输入 APIKey'} autoComplete="new-password" />
          </div>
          <div>
            <label className={labelCls}>{apiSecretMasked ? `APISecret(当前 ${apiSecretMasked},留空不改)` : 'APISecret'}</label>
            <input className={inputCls} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
              placeholder={apiSecretMasked ? '留空则保持现有' : '请输入 APISecret'} autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40" />
            <span className="text-sm text-slate-700 font-bold">启用讯飞语音转写</span>
          </label>
          {err && <div className="text-sm text-rose-500 font-bold">{err}</div>}
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? '保存中…' : '保存'}</button>
            {msg && <span className="text-sm text-emerald-600 font-bold">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

export default function IntegrationSettings() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-slate-800">
        <div className="p-1.5 bg-sky-100 text-sky-600 rounded-lg"><Plug className="w-4 h-4" /></div>
        <h2 className="font-bold text-base">第三方集成配置</h2>
      </div>
      <WechatCard />
      <XfyunCard />
    </div>
  );
}
