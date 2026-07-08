import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Save, XCircle } from 'lucide-react';
import type { AlipayConfigInput } from '@nongchang/shared';
import { getAlipayConfig, saveAlipayConfig } from '../api/billing';
import { useApi } from '../hooks/useApi';
import { fluentButton, fluentInput, fluentStatusTag } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function BillingAlipayConfig() {
  const cfgApi = useApi(getAlipayConfig);
  const cfg = cfgApi.data;
  const configured = !!cfg;

  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [alipayPublicKey, setAlipayPublicKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!cfg) return;
    setAppId(cfg.appId ?? '');
    setEnabled(cfg.enabled);
  }, [cfg]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  async function handleSave() {
    if (!appId.trim()) {
      setErr('请填写支付宝应用 appId');
      return;
    }
    if (!configured && (!privateKey.trim() || !alipayPublicKey.trim())) {
      setErr('首次配置需填写应用私钥与支付宝公钥');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const dto: AlipayConfigInput = {
        appId: appId.trim(),
        enabled,
        ...(privateKey.trim() ? { privateKey: privateKey.trim() } : {}),
        ...(alipayPublicKey.trim() ? { alipayPublicKey: alipayPublicKey.trim() } : {}),
      };
      await saveAlipayConfig(dto);
      setPrivateKey('');
      setAlipayPublicKey('');
      showToast('支付宝配置已保存');
      void cfgApi.reload();
    } catch (error) {
      setErr(errMsg(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
          <CreditCard className="h-4 w-4 text-[#0078D4]" />
          支付宝支付配置
        </div>
        {configured && (
          <span className={fluentStatusTag(enabled ? 'success' : 'neutral')}>
            {enabled ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {enabled ? '已启用' : '未启用'}
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        {cfgApi.loading && <LoadingState label="加载支付宝配置" />}
        {cfgApi.error && <ErrorState message={cfgApi.error} onRetry={() => void cfgApi.reload()} />}

        {!cfgApi.loading && !cfgApi.error && (
          <>
            <p className="text-xs leading-5 text-[#605E5C]">
              配置本租户专属的支付宝商户应用。密钥加密入库，保存后仅显示掩码；更新密钥时重新填写，留空则沿用旧值。
            </p>

            <label htmlFor="alipay-app-id" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
              应用 appId
              <input
                id="alipay-app-id"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                placeholder="2021000000000000"
                className={`${fluentInput} w-full`}
              />
            </label>

            <label htmlFor="alipay-private-key" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
              <span>
                应用私钥（PEM）
                {cfg?.privateKeyMasked && <span className="ml-2 font-normal text-[#107C10]">当前：{cfg.privateKeyMasked}</span>}
              </span>
              <textarea
                id="alipay-private-key"
                value={privateKey}
                onChange={(event) => setPrivateKey(event.target.value)}
                rows={3}
                placeholder={configured ? '留空沿用旧值，如需更新请粘贴新私钥' : '-----BEGIN PRIVATE KEY-----'}
                className={`${fluentInput} min-h-20 w-full py-2 font-mono text-xs`}
              />
            </label>

            <label htmlFor="alipay-public-key" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
              <span>
                支付宝公钥（PEM）
                {cfg?.alipayPublicKeyMasked && <span className="ml-2 font-normal text-[#107C10]">当前：{cfg.alipayPublicKeyMasked}</span>}
              </span>
              <textarea
                id="alipay-public-key"
                value={alipayPublicKey}
                onChange={(event) => setAlipayPublicKey(event.target.value)}
                rows={3}
                placeholder={configured ? '留空沿用旧值，如需更新请粘贴新公钥' : '-----BEGIN PUBLIC KEY-----'}
                className={`${fluentInput} min-h-20 w-full py-2 font-mono text-xs`}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#242424]">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-[#C8C6C4] text-[#0078D4] focus:ring-[#0078D4]/40"
              />
              启用支付宝支付
            </label>

            {err && <ErrorState message={err} retryLabel="关闭" onRetry={() => setErr('')} />}

            <div className="flex justify-end">
              <button type="button" onClick={() => void handleSave()} disabled={saving} className={fluentButton('primary')}>
                <Save className="h-4 w-4" />
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 border border-[#E1DFDD] bg-[#242424] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
