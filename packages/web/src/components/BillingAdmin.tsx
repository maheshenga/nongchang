import { useCallback, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRightLeft, Loader2, Plus, QrCode, Wallet, X, Zap } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/auth-context';
import { allocateCredit, getBillingSummary, listCreditAccounts, rechargeCredit } from '../api/billing';
import type { AllocateInput, CreditAccountItem, CreditResource, RechargeInput } from '@nongchang/shared';
import BillingLedger from './BillingLedger';
import BillingPurchase from './BillingPurchase';
import BillingPlans from './BillingPlans';
import BillingAlipayConfig from './BillingAlipayConfig';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { MANAGEMENT_PAGE_SIZE, normalizePage, PaginationControls } from '../ui/pagination';

const LOW = 100;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function BillingAdmin() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'system_admin';
  const canAllocate = user?.role === 'system_admin' || user?.role === 'agent_admin';

  const sum = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
  const [accountPageNumber, setAccountPageNumber] = useState(1);
  const fetchAccounts = useCallback(
    () => listCreditAccounts({ page: accountPageNumber, pageSize: MANAGEMENT_PAGE_SIZE }),
    [accountPageNumber],
  );
  const acc = useApi(fetchAccounts, { cacheKey: `billing-accounts-page-${accountPageNumber}` });
  const accountPage = normalizePage<CreditAccountItem>(acc.data, accountPageNumber);
  const accounts = accountPage.items;

  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const [showRecharge, setShowRecharge] = useState(false);
  const [rcForm, setRcForm] = useState<{ resource: CreditResource; amount: number }>({ resource: 'AI', amount: 100 });
  const [rcSaving, setRcSaving] = useState(false);
  const [rcErr, setRcErr] = useState('');

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

  function BalanceCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
    const low = value < LOW;
    return (
      <div className={`flex-1 border bg-white p-4 ${low ? 'border-[#FCE100]' : 'border-[#E1DFDD]'}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#605E5C]">{icon} {label}</span>
          {low && (
            <span className={fluentStatusTag('warning')}>
              <AlertTriangle className="mr-1 h-3 w-3" /> 预警
            </span>
          )}
        </div>
        <div className="mt-3 font-mono text-3xl font-semibold text-[#242424]">{value.toLocaleString('zh-CN')}</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <Wallet className="h-5 w-5 text-[#0078D4]" />
            额度管理
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">查看 AI 算力与二维码额度余额，向下级账户分配额度并追溯真实流水</p>
        </div>
        {isSystemAdmin && (
          <button type="button" onClick={() => { setShowRecharge(true); setRcErr(''); }} className={fluentButton('primary')}>
            <Plus className="h-4 w-4" /> 充值
          </button>
        )}
      </header>

      <main className="fluent-scrollbar min-h-0 flex-1 overflow-y-auto space-y-4">
        {sum.error && (
          <div className="border border-[#F1B8BD] bg-[#FDE7E9] p-4 text-sm text-[#A4262C]">
            {sum.error}
            <button type="button" onClick={() => void sum.reload()} className="ml-2 font-semibold underline">重试</button>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <BalanceCard label="AI 算力余额" value={aiBal} icon={<Zap className="h-4 w-4 text-[#0078D4]" />} />
          <BalanceCard label="二维码余额" value={codeBal} icon={<QrCode className="h-4 w-4 text-[#0078D4]" />} />
        </section>

        {!isSystemAdmin && <BillingPurchase onPaid={() => { void sum.reload(); }} />}
        {isSystemAdmin && <BillingPlans />}
        {isSystemAdmin && <BillingAlipayConfig />}

        <section className="border border-[#E1DFDD] bg-white">
          <div className="flex h-11 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold text-[#242424]">
            <ArrowRightLeft className="h-4 w-4 text-[#0078D4]" /> 下级账户
          </div>
          {acc.loading && <LoadingState label="加载下级账户" />}
          {acc.error && (
            <ErrorState message={acc.error} onRetry={() => void acc.reload()} className="m-4" />
          )}
          {!acc.loading && !acc.error && accounts.length === 0 && (
            <EmptyState title="暂无下级账户" description="创建代理商或商户后会显示额度账户。" />
          )}
          {!acc.loading && !acc.error && accounts.length > 0 && (
            <div className="overflow-x-auto">
              <table className={`${fluentTable.table} min-w-[680px]`}>
                <thead className={fluentTable.thead}>
                  <tr>
                    <th className={fluentTable.th}>名称</th>
                    <th className={`${fluentTable.th} text-right`}>AI 余额</th>
                    <th className={`${fluentTable.th} text-right`}>二维码余额</th>
                    <th className={`${fluentTable.th} text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((row) => (
                    <tr key={row.id} className={fluentTable.row}>
                      <td className={`${fluentTable.td} font-semibold`}>{row.ownerName}</td>
                      <td className={`${fluentTable.td} text-right font-mono`}>{row.aiBalance.toLocaleString('zh-CN')}</td>
                      <td className={`${fluentTable.td} text-right font-mono`}>{row.codeBalance.toLocaleString('zh-CN')}</td>
                      <td className={`${fluentTable.td} text-right`}>
                        {canAllocate ? (
                          <button type="button" onClick={() => openAllocate(row)} className={fluentButton('subtle')}>
                            <ArrowRightLeft className="h-4 w-4" /> 分配
                          </button>
                        ) : (
                          <span className="text-xs text-[#605E5C]">仅可查看</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!acc.error && (
            <PaginationControls
              page={accountPage.page}
              pageSize={accountPage.pageSize}
              total={accountPage.total}
              loading={acc.loading}
              onPageChange={setAccountPageNumber}
            />
          )}
        </section>

        <BillingLedger />
      </main>

      {showRecharge && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div role="dialog" aria-modal="true" aria-label="平台充值" className="w-full max-w-md overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#242424]"><Plus className="h-5 w-5 text-[#0078D4]" /> 平台充值</h3>
              <button type="button" onClick={() => setShowRecharge(false)} aria-label="关闭" className={fluentButton('icon')}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              <label htmlFor="recharge-resource" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
                资源类型
                <select id="recharge-resource" value={rcForm.resource} onChange={(e) => setRcForm({ ...rcForm, resource: e.target.value as CreditResource })} className={`${fluentSelect} w-full`}>
                  <option value="AI">AI 算力</option>
                  <option value="CODE">二维码</option>
                </select>
              </label>
              <label htmlFor="recharge-amount" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
                充值数量
                <input id="recharge-amount" type="number" min={1} value={rcForm.amount} onChange={(e) => setRcForm({ ...rcForm, amount: Number(e.target.value) })} className={`${fluentInput} w-full`} />
              </label>
              {rcErr && <p className="text-sm font-semibold text-[#A4262C]">{rcErr}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={() => setShowRecharge(false)} className={fluentButton('secondary')}>取消</button>
              <button type="button" onClick={() => void handleRecharge()} disabled={rcSaving} className={fluentButton('primary')}>
                {rcSaving && <Loader2 className="h-4 w-4 animate-spin" />} 确认充值
              </button>
            </div>
          </div>
        </div>
      )}

      {allocTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div role="dialog" aria-modal="true" aria-label="分配额度" className="w-full max-w-md overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#242424]"><ArrowRightLeft className="h-5 w-5 text-[#0078D4]" /> 分配额度</h3>
              <button type="button" onClick={() => setAllocTarget(null)} aria-label="关闭" className={fluentButton('icon')}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 text-sm text-[#605E5C]">
                目标账户: <span className="font-semibold text-[#242424]">{allocTarget.ownerName}</span>
              </div>
              <label htmlFor="allocate-resource" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
                资源类型
                <select id="allocate-resource" value={alForm.resource} onChange={(e) => setAlForm({ ...alForm, resource: e.target.value as CreditResource })} className={`${fluentSelect} w-full`}>
                  <option value="AI">AI 算力</option>
                  <option value="CODE">二维码</option>
                </select>
              </label>
              <label htmlFor="allocate-amount" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
                分配数量
                <input id="allocate-amount" type="number" min={1} value={alForm.amount} onChange={(e) => setAlForm({ ...alForm, amount: Number(e.target.value) })} className={`${fluentInput} w-full`} />
              </label>
              {alErr && <p className="text-sm font-semibold text-[#A4262C]">{alErr}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={() => setAllocTarget(null)} className={fluentButton('secondary')}>取消</button>
              <button type="button" onClick={() => void handleAllocate()} disabled={alSaving} className={fluentButton('primary')}>
                {alSaving && <Loader2 className="h-4 w-4 animate-spin" />} 确认分配
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 border border-[#E1DFDD] bg-[#242424] px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>
      )}
    </div>
  );
}
