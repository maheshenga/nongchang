import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Printer, Search, QrCode, X, ShieldCheck } from 'lucide-react';
import { Crop } from '../types';
import { useApi } from '../hooks/useApi';
import { listBatches, type Batch } from '../api/batches';
import { createTraceGenerationRequestKey, generateCodes } from '../api/trace';
import type { AppTab } from '../navigation';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

interface MerchantAdminProps {
  onNavigate?: (tab: AppTab) => void;
}

function toCrop(b: Batch): Crop {
  return {
    id: b.id,
    name: b.cropName,
    batchNo: b.batchNo,
    plantDate: b.plantDate.slice(0, 10),
    expectedHarvest: b.expectedHarvest.slice(0, 10),
    qrCodesGenerated: b.codeCount,
    status: b.status as Crop['status'],
  };
}

function statusLabel(status: Crop['status']) {
  if (status === 'Planting') return '组培扩繁中';
  if (status === 'Growing') return '大棚养护中';
  if (status === 'Harvested') return '已完成出圃';
  if (status === 'Distributed') return '已流转终端市场';
  return status;
}

function statusTone(status: Crop['status']): Parameters<typeof fluentStatusTag>[0] {
  if (status === 'Harvested') return 'success';
  if (status === 'Growing') return 'active';
  if (status === 'Planting') return 'warning';
  return 'neutral';
}

export default function MerchantAdmin({ onNavigate }: MerchantAdminProps) {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches, { cacheKey: 'batches' });
  const crops: Crop[] = (rawBatches ?? []).map(toCrop);
  const [selectedCropIds, setSelectedCropIds] = useState<Set<string>>(new Set());
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // 打印预览时为每个批次真实生成的溯源码: batchId -> code。
  const [cropCodes, setCropCodes] = useState<Record<string, string>>({});
  const [generatingPrint, setGeneratingPrint] = useState(false);
  const generationRequestKeys = useRef<Record<string, string>>({});

  const filteredCrops = crops.filter(crop =>
    crop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    crop.batchNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    crop.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedCropIds.size === filteredCrops.length && filteredCrops.length > 0) {
      setSelectedCropIds(new Set());
    } else {
      setSelectedCropIds(new Set(filteredCrops.map(c => c.id)));
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const selectedCrops = crops.filter(c => selectedCropIds.has(c.id));
  const activeCrop = selectedCrops.length > 0 ? selectedCrops[selectedCrops.length - 1] : null;
  const getGenerationRequestKey = (source: string, batchId: string, count: number) => {
    const operationKey = `${source}:${batchId}:${count}`;
    generationRequestKeys.current[operationKey] ??= createTraceGenerationRequestKey(source, batchId, count);
    return generationRequestKeys.current[operationKey];
  };
  const clearGenerationRequestKey = (source: string, batchId: string, count: number) => {
    delete generationRequestKeys.current[`${source}:${batchId}:${count}`];
  };

  // 消费者扫码访问的真实溯源页 URL(hash 路由 H5)。
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;

  const openPrintPreview = async () => {
    if (selectedCrops.length === 0) return;
    setGeneratingPrint(true);
    try {
      const entries = await Promise.all(
        selectedCrops.map(async (c) => {
          const requestKey = getGenerationRequestKey('merchant-print', c.id, 1);
          const codes = await generateCodes(c.id, 1, requestKey);
          return [c.id, codes[0]?.code] as const;
        }),
      );
      setCropCodes(Object.fromEntries(entries.filter(([, code]) => code)));
      selectedCrops.forEach((c) => clearGenerationRequestKey('merchant-print', c.id, 1));
      setShowPrintPreview(true);
    } catch (e) {
      showToast(e instanceof Error ? `生成溯源码失败:${e.message}` : '生成溯源码失败');
    } finally {
      setGeneratingPrint(false);
    }
  };

  const generateForActiveCrop = async () => {
    if (!activeCrop) return;
    if (!Number.isInteger(qrAmount) || qrAmount < 1 || qrAmount > 10000) {
      showToast('赋码数量需为 1-10000 的整数');
      return;
    }
    setGeneratingPrint(true);
    try {
      const requestKey = getGenerationRequestKey('merchant-side-panel', activeCrop.id, qrAmount);
      const codes = await generateCodes(activeCrop.id, qrAmount, requestKey);
      const firstCode = codes[0]?.code;
      if (firstCode) setCropCodes((current) => ({ ...current, [activeCrop.id]: firstCode }));
      showToast(`已生成 ${codes.length} 个溯源码`);
      await reload();
      clearGenerationRequestKey('merchant-side-panel', activeCrop.id, qrAmount);
    } catch (e) {
      showToast(e instanceof Error ? `生成溯源码失败:${e.message}` : '生成溯源码失败');
    } finally {
      setGeneratingPrint(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedCropIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCropIds(newSet);
  };
  const [qrAmount, setQrAmount] = useState<number>(100);

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-w-0 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
              <input
                type="text"
                placeholder="搜索批次或作物名称..."
                aria-label="搜索批次或作物名称"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${fluentInput} w-full pl-8 sm:w-72`}
              />
            </div>
            {selectedCropIds.size > 0 && (
              <button
                type="button"
                onClick={() => void openPrintPreview()}
                disabled={generatingPrint}
                className={fluentButton('secondary')}
              >
                <Printer className="h-4 w-4" />
                {generatingPrint ? '生成中...' : `打印追溯标签 (${selectedCropIds.size})`}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('batches')}
            className={fluentButton('primary')}
          >
            <Plus className="h-4 w-4" />
            新增生产批次
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && <LoadingState label="加载批次档案" />}
          {error && <ErrorState message={error} onRetry={() => void reload()} />}
          {!loading && !error && filteredCrops.length === 0 && (
            <EmptyState title="暂无批次档案" description="请先在批次管理中创建生产批次。" />
          )}
          {!loading && !error && filteredCrops.length > 0 && (
            <div className={fluentTable.wrapper}>
              <table className={`${fluentTable.table} whitespace-nowrap`}>
                <thead className={fluentTable.thead}>
                  <tr>
                    <th className={`${fluentTable.th} w-10`}>
                      <input
                        type="checkbox"
                        aria-label="选择全部批次"
                        onChange={toggleSelectAll}
                        checked={selectedCropIds.size === filteredCrops.length && filteredCrops.length > 0}
                      />
                    </th>
                    <th className={fluentTable.th}>作物品种/名称</th>
                    <th className={fluentTable.th}>源头繁育批次号</th>
                    <th className={fluentTable.th}>当前生命周期状态</th>
                    <th className={fluentTable.th}>已生成赋码数量</th>
                    <th className={fluentTable.th}>产品全链路操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCrops.map((crop) => (
                    <tr key={crop.id} className={selectedCropIds.has(crop.id) ? fluentTable.rowSelected : fluentTable.row}>
                      <td className={fluentTable.td}>
                        <input
                          type="checkbox"
                          aria-label={`选择 ${crop.name}`}
                          checked={selectedCropIds.has(crop.id)}
                          onChange={() => toggleSelect(crop.id)}
                        />
                      </td>
                      <td className={`${fluentTable.td} cursor-pointer font-semibold text-[#242424]`} onClick={() => toggleSelect(crop.id)}>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] bg-[#E5F1FB] text-xs font-semibold text-[#005A9E]">
                            {crop.name.substring(0, 1)}
                          </span>
                          <span>{crop.name}</span>
                        </div>
                      </td>
                      <td className={`${fluentTable.td} cursor-pointer font-mono text-xs text-[#605E5C]`} onClick={() => toggleSelect(crop.id)}>
                        {crop.batchNo}
                      </td>
                      <td className={`${fluentTable.td} cursor-pointer`} onClick={() => toggleSelect(crop.id)}>
                        <span className={fluentStatusTag(statusTone(crop.status))}>{statusLabel(crop.status)}</span>
                      </td>
                      <td className={`${fluentTable.td} font-mono text-xs font-semibold text-[#242424]`}>
                        {crop.qrCodesGenerated.toLocaleString()} 张
                      </td>
                      <td className={fluentTable.td}>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCropIds(new Set([crop.id]))}
                            className={fluentButton('subtle')}
                          >
                            选择后生成
                          </button>
                          <span className="max-w-[280px] whitespace-normal text-xs leading-5 text-[#605E5C]">
                            批次状态流转、发货流向、出入库单和完整追溯档案请在批次管理中处理。
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border border-[#E1DFDD] bg-white">
        <div className="border-b border-[#E1DFDD] bg-[#FAFAFA] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
            <span className="grid h-7 w-7 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#005A9E]">
              <QrCode className="h-4 w-4" />
            </span>
            一物一码追溯赋码管理
          </h3>
          <p className="mt-2 text-xs leading-5 text-[#605E5C]">按服务端实际生成数量扣除二维码额度。</p>
        </div>

        {activeCrop ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="border border-[#E1DFDD] bg-[#F5F9FF] p-3">
              <p className="text-xs font-semibold text-[#005A9E]">当前发码目标档案</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-[#242424]">{activeCrop.name}</span>
                <span className="shrink-0 rounded-[4px] bg-white px-2 py-1 font-mono text-xs text-[#605E5C]">{activeCrop.batchNo}</span>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#323130]">本次批量生成云端溯源标签数量 (枚)</span>
                <input
                  aria-label="本次生成溯源码数量"
                  type="number"
                  value={qrAmount}
                  onChange={(e) => setQrAmount(Number(e.target.value))}
                  className={`${fluentInput} w-full font-mono`}
                />
              </label>

              <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-3">
                <p className="text-xs font-semibold text-[#323130]">标签数据来源</p>
                <p className="mt-1 text-xs leading-5 text-[#605E5C]">
                  打印标签仅使用当前批次资料和服务端生成的溯源码。未接入的营销、检测或证明能力不会出现在生产标签中。
                </p>
              </div>

              <div className="border border-[#E1DFDD] bg-white p-4 text-center">
                <div className="mx-auto inline-block border border-[#E1DFDD] bg-white p-2">
                  <QRCodeSVG value={traceUrl(cropCodes[activeCrop.id] ?? activeCrop.batchNo)} size={120} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#605E5C]">
                  {cropCodes[activeCrop.id]
                    ? '已生成真实溯源码，可打印或扫码查看。'
                    : '选择数量并生成后，二维码将指向真实溯源码。'}
                </p>
              </div>

              <div className="border-t border-[#E1DFDD] pt-4">
                <div className="mb-3 flex items-center justify-between border border-[#F1C6CA] bg-[#FDE7E9] p-3">
                  <span className="text-xs font-semibold text-[#323130]">预计扣除二维码额度</span>
                  <span className="font-mono text-sm font-semibold text-[#A4262C]">{Number.isFinite(qrAmount) ? qrAmount : 0} 个</span>
                </div>
                <button
                  type="button"
                  onClick={() => void generateForActiveCrop()}
                  disabled={generatingPrint}
                  className={`${fluentButton('primary')} w-full`}
                >
                  <Printer className="h-4 w-4" />
                  {generatingPrint ? '生成中...' : '生成溯源码'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="请先选择批次档案"
            description="选择左侧批次后，系统会显示对应的溯源码生成与标签预览面板。"
            className="flex-1"
          />
        )}
      </aside>

      {showPrintPreview && (
        <div role="dialog" aria-modal="true" aria-label="溯源码标签打印预览" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-[#E1DFDD] bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#242424]">
                <Printer className="h-5 w-5 text-[#0078D4]" />
                溯源码标签打印预览 (4x6寸)
              </h3>
              <button type="button" onClick={() => setShowPrintPreview(false)} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto bg-[#F5F5F5] p-6">
              <p className="border border-[#E1DFDD] bg-white px-3 py-2 text-sm font-semibold text-[#605E5C]">
                已成功生成 {selectedCrops.length} 个批次的溯源码，可打印真实标签。
              </p>
              {selectedCrops.map(crop => (
                <div key={crop.id} className="flex h-[600px] w-[400px] origin-top scale-[0.85] flex-col border border-[#C8C6C4] bg-white p-8 sm:scale-100">
                  <div className="border-b-2 border-[#242424] pb-5 text-center">
                    <h1 className="text-3xl font-semibold tracking-normal text-[#242424]">溯源码标签</h1>
                    <h2 className="mt-2 text-sm font-semibold text-[#605E5C]">扫码查看该批次已登记的溯源信息</h2>
                  </div>

                  <div className="mb-8 mt-6 flex items-center justify-between">
                    <div className="border border-[#E1DFDD] bg-white p-2">
                      <QRCodeSVG value={traceUrl(cropCodes[crop.id] ?? crop.batchNo)} size={120} level="H" />
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-[#605E5C]">批次号</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-[#242424]">{crop.batchNo}</div>
                      <div className="mt-3 text-xs font-semibold text-[#605E5C]">溯源码</div>
                      <div className="mt-1 rounded-[4px] bg-[#F3F2F1] px-2 py-1 font-mono text-sm font-semibold text-[#323130]">
                        {cropCodes[crop.id] ?? crop.batchNo}
                      </div>
                    </div>
                  </div>

                  <table className="mb-6 w-full border-collapse text-left text-sm">
                    <tbody>
                      <tr className="border-b border-dashed border-[#C8C6C4]">
                        <th className="w-1/3 py-3 font-semibold text-[#605E5C]">作物名称</th>
                        <td className="py-3 text-lg font-semibold text-[#242424]">{crop.name}</td>
                      </tr>
                      <tr className="border-b border-dashed border-[#C8C6C4]">
                        <th className="py-3 font-semibold text-[#605E5C]">批次号</th>
                        <td className="py-3 font-mono font-semibold text-[#323130]">{crop.batchNo}</td>
                      </tr>
                      <tr className="border-b border-dashed border-[#C8C6C4]">
                        <th className="py-3 font-semibold text-[#605E5C]">种植日期</th>
                        <td className="py-3 font-mono font-semibold text-[#323130]">{crop.plantDate}</td>
                      </tr>
                      <tr className="border-b border-dashed border-[#C8C6C4]">
                        <th className="py-3 font-semibold text-[#605E5C]">当前状态</th>
                        <td className="py-3 font-semibold text-[#323130]">{statusLabel(crop.status)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="mt-auto border-t-2 border-[#242424] pt-5 text-center text-xs font-semibold leading-5 text-[#605E5C]">
                    <p>扫码进入公开溯源页</p>
                    <p className="mt-2 font-mono">{cropCodes[crop.id] ?? crop.batchNo}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-[#E1DFDD] bg-white p-4">
              <button type="button" onClick={() => setShowPrintPreview(false)} className={fluentButton('secondary')}>放弃打印</button>
              <button type="button" onClick={() => {
                window.print();
                setShowPrintPreview(false);
              }} className={fluentButton('primary')}>
                <Printer className="h-4 w-4" /> 打印当前页面
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-2 border border-[#E1DFDD] bg-white px-4 py-3 text-sm font-semibold text-[#242424] shadow-lg">
          <ShieldCheck className="h-5 w-5 text-[#0078D4]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
