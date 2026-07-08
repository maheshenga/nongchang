import { PackageSearch, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Role } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listSupplies, createSupply, issueSupply, deleteSupply } from '../api/supply';
import { listBatches } from '../api/batches';
import { useAuth } from '../auth/auth-context';
import { confirmDialog } from '../hooks/useDialog';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

const unitOptions = ['箱', '包(50kg)', '桶(20L)', '件'];

export default function LogisticsTracker() {
  const { user } = useAuth();
  const isMerchant = user?.role === Role.MERCHANT;
  const { data: supplies, loading: suppliesLoading, error: suppliesError, reload: reloadSupplies } = useApi(listSupplies);
  const { data: batches, loading: batchesLoading, error: batchesError } = useApi(listBatches);
  const [showInboundModal, setShowInboundModal] = useState(false);
  const [showOutboundModal, setShowOutboundModal] = useState(false);
  const [issuePayload, setIssuePayload] = useState({ supplyId: '', amount: 0, batchId: '' });
  const [inboundPayload, setInboundPayload] = useState({ name: '', amount: 0, unit: '箱' });
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleIssueSubmit = async () => {
    if (!isMerchant) return showToast('当前视图只读');
    if (!issuePayload.supplyId || issuePayload.amount <= 0) return showToast('请输入完整信息');
    if (!issuePayload.batchId) return showToast('请选择关联批次');
    try {
      await issueSupply(issuePayload.supplyId, { batchId: issuePayload.batchId, amount: issuePayload.amount });
      setShowOutboundModal(false);
      setIssuePayload({ supplyId: '', amount: 0, batchId: '' });
      showToast('领用单下发成功');
      await reloadSupplies();
    } catch (e: any) {
      showToast(e?.message || '领用失败(可能超量熔断)');
    }
  };

  const handleInboundSubmit = async () => {
    if (!isMerchant) return showToast('当前视图只读');
    if (!inboundPayload.name || inboundPayload.amount <= 0) return showToast('请输入完整信息');
    try {
      await createSupply({ name: inboundPayload.name, unit: inboundPayload.unit, amount: inboundPayload.amount });
      setShowInboundModal(false);
      setInboundPayload({ name: '', amount: 0, unit: '箱' });
      showToast('农资入库完成');
      await reloadSupplies();
    } catch (e: any) {
      showToast(e?.message || '入库失败');
    }
  };

  const suppliesList = supplies ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="border border-[#E1DFDD] bg-white px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-[#242424]">
              <PackageSearch className="h-5 w-5 text-[#0078D4]" />
              农资投入品管理
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[#605E5C]">
              登记农资入库与领用出账。领用单会绑定所选生产批次，后端校验库存余量与批次归属。
            </p>
          </div>
          <span className={fluentStatusTag(isMerchant ? 'active' : 'neutral')}>
            {isMerchant ? '商户可写' : '非商户只读'}
          </span>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
              <PackageSearch className="h-4 w-4 text-[#0078D4]" />
              投入品库存台账
            </div>
            <p className="mt-1 text-xs leading-5 text-[#605E5C]">库存扣减以领用单为准，超量会由后端熔断并返回错误。</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isMerchant ? (
              <>
                <button type="button" onClick={() => setShowInboundModal(true)} className={fluentButton('secondary')}>
                  入库登记
                </button>
                <button type="button" onClick={() => setShowOutboundModal(true)} className={fluentButton('primary')}>
                  <Plus className="h-4 w-4" />
                  领用下达
                </button>
              </>
            ) : (
              <span className={fluentStatusTag('neutral')}>只读视图</span>
            )}
          </div>
        </div>

        <div className="border-b border-[#EDEBE9] bg-[#F8FBFD] px-5 py-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0078D4]" />
            <div>
              <div className="text-sm font-semibold text-[#242424]">库存余量校验已开启</div>
              <p className="mt-1 text-xs leading-5 text-[#605E5C]">
                领用时必须选择真实批次，系统会记录出账并阻止超过剩余库存的领用请求。
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {suppliesLoading && <LoadingState label="加载投入品台账" />}
          {suppliesError && <ErrorState message={suppliesError} onRetry={() => void reloadSupplies()} />}
          {!suppliesLoading && !suppliesError && suppliesList.length === 0 && (
            <EmptyState title="暂无投入品台账" description="完成入库登记后会在这里显示库存、已领用与剩余数量。" />
          )}

          {!suppliesLoading && !suppliesError && suppliesList.length > 0 && (
            <div className={`${fluentTable.wrapper} overflow-x-auto`}>
              <table className={`${fluentTable.table} min-w-[760px]`}>
                <thead className={fluentTable.thead}>
                  <tr>
                    <th className={fluentTable.th}>投入品</th>
                    <th className={`${fluentTable.th} text-right`}>入库总量</th>
                    <th className={`${fluentTable.th} text-right`}>已领用</th>
                    <th className={`${fluentTable.th} text-right`}>剩余</th>
                    <th className={fluentTable.th}>库存状态</th>
                    <th className={`${fluentTable.th} text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliesList.map((item) => {
                    const total = Math.max(item.total, 0);
                    const usedPercent = total > 0 ? Math.min(100, Math.round((item.used / total) * 100)) : 0;

                    return (
                      <tr key={item.id} className={fluentTable.row}>
                        <td className={fluentTable.td}>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[#242424]">{item.name}</div>
                            <div className="mt-0.5 font-mono text-xs text-[#605E5C]">{item.id}</div>
                          </div>
                        </td>
                        <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>
                          {item.total} {item.unit}
                        </td>
                        <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>
                          {item.used} {item.unit}
                        </td>
                        <td className={`${fluentTable.td} text-right`}>
                          <div className="ml-auto w-32">
                            <div className="mb-1 flex justify-between text-xs text-[#605E5C]">
                              <span>剩余</span>
                              <span className="font-mono font-semibold text-[#242424]">{item.remaining}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-[4px] bg-[#EDEBE9]">
                              <div
                                className={`h-full ${item.alert ? 'bg-[#A4262C]' : 'bg-[#0078D4]'}`}
                                style={{ width: `${usedPercent}%` }}
                                aria-label={`${item.name} 已领用 ${usedPercent}%`}
                              />
                            </div>
                          </div>
                        </td>
                        <td className={fluentTable.td}>
                          <span className={fluentStatusTag(item.alert ? 'danger' : 'success')}>
                            {item.alert ? '库存预警' : '库存正常'}
                          </span>
                        </td>
                        <td className={`${fluentTable.td} text-right`}>
                          {isMerchant && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirmDialog({ title: '删除农资记录', message: '确认删除此农资记录吗?', confirmLabel: '删除', tone: 'danger' })) {
                                  try {
                                    await deleteSupply(item.id);
                                    showToast(`已删除农资档案:${item.name}`);
                                    await reloadSupplies();
                                  } catch (e: any) {
                                    showToast(e?.message || '删除失败');
                                  }
                                }
                              }}
                              className={fluentButton('danger')}
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {showInboundModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div role="dialog" aria-modal="true" aria-label="农资入库登记" className="w-full max-w-md border border-[#E1DFDD] bg-white">
            <div className="border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <h3 className="text-base font-semibold text-[#242424]">农资入库登记</h3>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-semibold text-[#605E5C]">
                投入品名称
                <input
                  aria-label="投入品名称"
                  type="text"
                  value={inboundPayload.name}
                  onChange={(e) => setInboundPayload({ ...inboundPayload, name: e.target.value })}
                  className={`${fluentInput} mt-1 w-full`}
                  placeholder="例如: 复合肥"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_128px]">
                <label className="block text-xs font-semibold text-[#605E5C]">
                  入库数量
                  <input
                    aria-label="入库数量"
                    type="number"
                    value={inboundPayload.amount}
                    onChange={(e) => setInboundPayload({ ...inboundPayload, amount: Number(e.target.value) })}
                    className={`${fluentInput} mt-1 w-full`}
                  />
                </label>
                <label className="block text-xs font-semibold text-[#605E5C]">
                  单位
                  <select
                    aria-label="单位"
                    value={inboundPayload.unit}
                    onChange={(e) => setInboundPayload({ ...inboundPayload, unit: e.target.value })}
                    className={`${fluentSelect} mt-1 w-full`}
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] px-5 py-4">
              <button type="button" onClick={() => setShowInboundModal(false)} className={fluentButton('secondary')}>
                取消
              </button>
              <button type="button" onClick={handleInboundSubmit} className={fluentButton('primary')}>
                确认入库
              </button>
            </div>
          </div>
        </div>
      )}

      {showOutboundModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div role="dialog" aria-modal="true" aria-label="农资领用下达" className="w-full max-w-md border border-[#E1DFDD] bg-white">
            <div className="border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <h3 className="text-base font-semibold text-[#242424]">农资领用下达</h3>
              <p className="mt-1 text-xs leading-5 text-[#605E5C]">领用明细会绑定所选批次，作为后续成本和库存追溯依据。</p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-semibold text-[#605E5C]">
                选择库存物资
                <select
                  aria-label="选择库存物资"
                  value={issuePayload.supplyId}
                  onChange={(e) => setIssuePayload({ ...issuePayload, supplyId: e.target.value })}
                  className={`${fluentSelect} mt-1 w-full`}
                >
                  <option value="">-- 请选择 --</option>
                  {suppliesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (剩余 {s.remaining} {s.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-[#605E5C]">
                关联生产批次
                <select
                  aria-label="关联生产批次"
                  value={issuePayload.batchId}
                  onChange={(e) => setIssuePayload({ ...issuePayload, batchId: e.target.value })}
                  disabled={batchesLoading}
                  className={`${fluentSelect} mt-1 w-full disabled:bg-[#F3F2F1] disabled:text-[#8A8886]`}
                >
                  <option value="">-- 请选择批次 --</option>
                  {(batches ?? []).map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchNo} - {batch.cropName}{batch.ownerName ? ` / ${batch.ownerName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {batchesError && <ErrorState message={`批次加载失败:${batchesError}`} onRetry={undefined} />}
              <label className="block text-xs font-semibold text-[#605E5C]">
                本次下达/领用数量
                <input
                  aria-label="本次下达/领用数量"
                  type="number"
                  value={issuePayload.amount}
                  onChange={(e) => setIssuePayload({ ...issuePayload, amount: Number(e.target.value) })}
                  className={`${fluentInput} mt-1 w-full`}
                />
              </label>
              <div className="border border-[#FCE100] bg-[#FFF4CE] px-3 py-2 text-xs leading-5 text-[#605E5C]">
                库存预警与超量限制已开启，过量领用将被系统自动拦截并记录审计。
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] px-5 py-4">
              <button type="button" onClick={() => setShowOutboundModal(false)} className={fluentButton('secondary')}>
                取消
              </button>
              <button type="button" onClick={handleIssueSubmit} className={fluentButton('primary')}>
                确认下发
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 border border-[#C8C6C4] bg-white px-4 py-3 text-sm font-semibold text-[#242424]">
          <ShieldCheck className="h-4 w-4 text-[#0078D4]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
