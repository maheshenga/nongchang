import { useState, useEffect } from 'react';
import { CreditCard, Loader2, Save, CheckCircle2, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { getAlipayConfig, saveAlipayConfig } from '../api/billing';
import type { AlipayConfigInput } from '@nongchang/shared';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 支付宝应用配置(仅 SYSTEM_ADMIN):应用 appId + 应用私钥 + 支付宝公钥(加密入库,仅回掩码)。
export default function BillingAlipayConfig() {
  const cfgApi = useApi(getAlipayConfig);
  const cfg = cfgApi.data;

  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [alipayPublicKey, setAlipayPublicKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (cfg) {
      setAppId(cfg.appId ?? '');
      setEnabled(cfg.enabled);
    }
  }, [cfg]);

  const configured = !!cfg;
  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  async function handleSave() {
    if (!appId.trim()) { setErr('请填写支付宝应用 appId'); return; }
    if (!configured && (!privateKey.trim() || !alipayPublicKey.trim())) {
      setErr('首次配置需填写应用私钥与支付宝公钥');
      return;
    }
    setSaving(true); setErr('');
    try {
      const dto: AlipayConfigInput = {
        appId: appId.trim(),
        enabled,
        // 留空表示沿用旧值(密钥更新时才传)。
        ...(privateKey.trim() ? { privateKey: privateKey.trim() } : {}),
        ...(alipayPublicKey.trim() ? { alipayPublicKey: alipayPublicKey.trim() } : {}),
      };
      await saveAlipayConfig(dto);
      setPrivateKey(''); setAlipayPublicKey('');
      showToast('支付宝配置已保存');
      void cfgApi.reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 flex items-center justify-between">
        <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /> 支付宝支付配置</span>
        {configured && (
          enabled
            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> 已启用</span>
            : <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> 未启用</span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {cfgApi.loading && <div className="text-center text-slate-400 text-sm flex items-center justify-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" /> 加载中…</div>}
        {!cfgApi.loading && (
          <>
            <p className="text-xs text-slate-500">配置本租户专属的支付宝商户应用。密钥加密入库,保存后仅显示掩码,需更新时重新填写;留空则沿用旧值。</p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">应用 appId</label>
              <input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="2021000000000000" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                应用私钥(PEM)
                {cfg?.privateKeyMasked && <span className="ml-2 text-emerald-600 font-normal">当前:{cfg.privateKeyMasked}</span>}
              </label>
              <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} rows={3} placeholder={configured ? '留空沿用旧值,如需更新请粘贴新私钥' : '-----BEGIN PRIVATE KEY-----'} className={`${inputCls} font-mono text-xs`} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                支付宝公钥(PEM)
                {cfg?.alipayPublicKeyMasked && <span className="ml-2 text-emerald-600 font-normal">当前:{cfg.alipayPublicKeyMasked}</span>}
              </label>
              <textarea value={alipayPublicKey} onChange={(e) => setAlipayPublicKey(e.target.value)} rows={3} placeholder={configured ? '留空沿用旧值,如需更新请粘贴新公钥' : '-----BEGIN PUBLIC KEY-----'} className={`${inputCls} font-mono text-xs`} />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              启用支付宝支付
            </label>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <div className="flex justify-end">
              <button onClick={() => void handleSave()} disabled={saving} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 保存配置
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-medium z-50">{toast}</div>
      )}
    </div>
  );
}
