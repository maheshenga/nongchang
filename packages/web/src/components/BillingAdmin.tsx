import { useState } from 'react';
import type { ReactNode } from 'react';
import { Wallet, Zap, QrCode, Plus, ArrowRightLeft, Loader2, X, AlertTriangle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/auth-context';
import { getBillingSummary, listCreditAccounts, allocateCredit, rechargeCredit } from '../api/billing';
import type { CreditAccountItem, CreditResource, AllocateInput, RechargeInput } from '@nongchang/shared';
import BillingLedger from './BillingLedger';
import BillingPurchase from './BillingPurchase';
import BillingPlans from './BillingPlans';
import BillingAlipayConfig from './BillingAlipayConfig';

const LOW = 100;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 额度仪表板:余额卡片 + 平台充值 + 下级账户分配 + 流水明细。
export default function BillingAdmin() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'system_admin';

  const sum = useApi(getBillingSummary);
  const acc = useApi(listCreditAccounts);
  const accounts: CreditAccountItem[] = acc.data ?? [];

  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  // 充值弹窗状态
  const [showRecharge, setShowRecharge] = useState(false);
  const [rcForm, setRcForm] = useState<{ resource: CreditResource; amount: number }>({ resource: 'AI', amount: 100 });
  const [rcSaving, setRcSaving] = useState(false);
  const [rcErr, setRcErr] = useState('');

  // 分配弹窗状态(targetOwnerType/targetOwnerId 由所选行预填)
  const [allocTarget, setAllocTarget] = useState<CreditAccountItem | null>(null);
  const [alForm, setAlForm] = useState<{ resource: CreditResource; amount: number }>({ resource: 'AI', amount: 100 });
  const [alSaving, setAlSaving] = useState(false);
  const [alErr, setAlErr] = useState('');

  async function handleRecharge() {
    if (!rcForm.amount || rcForm.amount < 1) { setRcErr('请输入有效的充值数量'); return; }
    setRcSaving(true); setRcErr('');
    try {
      const dto: RechargeInput = { resource: rcForm.resource, amount: Number(rcForm.amount) };
      await rechargeCredit(dto);
      setShowRecharge(false);
      setRcForm({ resource: 'AI', amount: 100 });
      showToast('充值成功');
      void sum.reload(); void acc.reload();
    } catch (e) {
      setRcErr(errMsg(e));
    } finally {
      setRcSaving(false);
    }
  }

  function openAllocate(row: CreditAccountItem) {
    setAllocTarget(row);
    setAlForm({ resource: 'AI', amount: 100 });
    setAlErr('');
  }

  async function handleAllocate() {
    if (!allocTarget) return;
    if (!alForm.amount || alForm.amount < 1) { setAlErr('请输入有效的分配数量'); return; }
    setAlSaving(true); setAlErr('');
    try {
      const dto: AllocateInput = {
        targetOwnerType: allocTarget.ownerType as 'AGENT' | 'MERCHANT',
        targetOwnerId: allocTarget.ownerId,
        resource: alForm.resource,
        amount: Number(alForm.amount),
      };
      await allocateCredit(dto);
      setAllocTarget(null);
      showToast('分配成功');
      void sum.reload(); void acc.reload();
    } catch (e) {
      setAlErr(errMsg(e));
    } finally {
      setAlSaving(false);
    }
  }

  const aiBal = sum.data?.aiBalance ?? 0;
  const codeBal = sum.data?.codeBalance ?? 0;
  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  function BalanceCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
    const low = value < LOW;
    return (
      <div className={`flex-1 rounded-xl border p-5 shadow-sm ${low ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 flex items-center gap-2">{icon} {label}</span>
          {low && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> 预警
            </span>
          )}
        </div>
        <div className={`mt-2 text-3xl font-bold font-mono ${low ? 'text-amber-600' : 'text-slate-800'}`}>{value.toLocaleString('zh-CN')}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
      <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            额度管理
          </h3>
          <p className="text-xs text-slate-500 mt-1">查看 AI 算力与二维码额度余额,向下级分配额度并追溯流水</p>
        </div>
        {isSystemAdmin && (
          <button onClick={() => { setShowRecharge(true); setRcErr(''); }} className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm">
            <Plus className="w-4 h-4" /> 充值
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-6">
        {sum.error && <div className="p-4 text-center text-rose-500 text-sm">{sum.error} <button onClick={() => void sum.reload()} className="underline font-bold ml-2">重试</button></div>}
        <div className="flex flex-col sm:flex-row gap-4">
          <BalanceCard label="AI算力余额" value={aiBal} icon={<Zap className="w-4 h-4 text-emerald-600" />} />
          <BalanceCard label="二维码余额" value={codeBal} icon={<QrCode className="w-4 h-4 text-emerald-600" />} />
        </div>

        {/* 自助购买:代理商/商户可买额度进自己账户 */}
        {!isSystemAdmin && <BillingPurchase onPaid={() => { void sum.reload(); }} />}

        {/* 套餐管理 + 支付宝配置:仅系统管理员 */}
        {isSystemAdmin && <BillingPlans />}
        {isSystemAdmin && <BillingAlipayConfig />}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-emerald-600" /> 下级账户
          </div>
          {acc.loading && <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 加载中…</div>}
          {acc.error && <div className="p-8 text-center text-rose-500 text-sm">{acc.error} <button onClick={() => void acc.reload()} className="underline font-bold ml-2">重试</button></div>}
          {!acc.loading && !acc.error && accounts.length === 0 && (
            <div className="flex flex-col items-center justify-center text-slate-400 py-12">
              <ArrowRightLeft className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">暂无下级账户</p>
            </div>
          )}
          {!acc.loading && !acc.error && accounts.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">名称</th>
                  <th className="px-4 py-2 font-medium text-right">AI余额</th>
                  <th className="px-4 py-2 font-medium text-right">二维码余额</th>
                  <th className="px-4 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">{row.ownerName}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{row.aiBalance.toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{row.codeBalance.toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => openAllocate(row)} className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 text-xs font-medium">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> 分配
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <BillingLedger />
      </div>

      {showRecharge && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Plus className="w-5 h-5 text-emerald-600" /> 平台充值</h3>
              <button onClick={() => setShowRecharge(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">资源类型</label>
                <select value={rcForm.resource} onChange={(e) => setRcForm({ ...rcForm, resource: e.target.value as CreditResource })} className={inputCls}>
                  <option value="AI">AI算力</option>
                  <option value="CODE">二维码</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">充值数量</label>
                <input type="number" min={1} value={rcForm.amount} onChange={(e) => setRcForm({ ...rcForm, amount: Number(e.target.value) })} className={inputCls} />
              </div>
              {rcErr && <p className="text-sm text-red-600">{rcErr}</p>}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowRecharge(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">取消</button>
              <button onClick={() => void handleRecharge()} disabled={rcSaving} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors inline-flex items-center gap-2">
                {rcSaving && <Loader2 className="w-4 h-4 animate-spin" />} 确认充值
              </button>
            </div>
          </div>
        </div>
      )}

      {allocTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-emerald-600" /> 分配额度</h3>
              <button onClick={() => setAllocTarget(null)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-500">目标账户:<span className="font-medium text-slate-700">{allocTarget.ownerName}</span></div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">资源类型</label>
                <select value={alForm.resource} onChange={(e) => setAlForm({ ...alForm, resource: e.target.value as CreditResource })} className={inputCls}>
                  <option value="AI">AI算力</option>
                  <option value="CODE">二维码</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">分配数量</label>
                <input type="number" min={1} value={alForm.amount} onChange={(e) => setAlForm({ ...alForm, amount: Number(e.target.value) })} className={inputCls} />
              </div>
              {alErr && <p className="text-sm text-red-600">{alErr}</p>}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setAllocTarget(null)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">取消</button>
              <button onClick={() => void handleAllocate()} disabled={alSaving} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors inline-flex items-center gap-2">
                {alSaving && <Loader2 className="w-4 h-4 animate-spin" />} 确认分配
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-medium z-50">{toast}</div>
      )}
    </div>
  );
}

