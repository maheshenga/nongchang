import {
  ChevronLeft,
  ChevronRight,
  Eye,
  QrCode,
} from 'lucide-react';
import { useState } from 'react';
import { fluentButton, fluentStatusTag, fluentTable } from '../../ui/fluent';
import { STATUS_LABEL, statusTone, type ViewBatch } from '../BatchAdmin.model';
import { BatchActionMenu } from './BatchActionMenu';

interface Props {
  loading: boolean;
  error: string | null;
  filteredData: ViewBatch[];
  pagedData: ViewBatch[];
  selectedIds: Set<string>;
  page: number;
  totalPages: number;
  exportingReportId: string | null;
  scanningCompliance: boolean;
  onReload(): void;
  onToggleAll(checked: boolean): void;
  onToggleOne(id: string, checked: boolean): void;
  onPage(page: number): void;
  onDetail(id: string): void;
  onGenerate(id: string): void;
  onAnalyze?: (batch: ViewBatch) => void;
  onCodes(id: string): void;
  onCompliance(id: string): void;
  onCredentials(batch: ViewBatch): void;
  onProfit(id: string): void;
  onReport(id: string): void;
  onDelete(batch: ViewBatch): void;
}

export function BatchTable(props: Props) {
  const [desktopOpenMenuBatchId, setDesktopOpenMenuBatchId] = useState<string | null>(null);
  const [mobileOpenMenuBatchId, setMobileOpenMenuBatchId] = useState<string | null>(null);
  const allSelected = props.filteredData.length > 0
    && props.filteredData.every(batch => props.selectedIds.has(batch.id));
  const someSelected = props.filteredData.some(batch => props.selectedIds.has(batch.id));

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {props.loading && <div className="p-8 text-center text-sm text-[#605E5C]">加载中...</div>}
        {props.error && (
          <div className="p-8 text-center text-sm text-[#A4262C]">
            {props.error}{' '}
            <button onClick={props.onReload} className="ml-2 font-semibold underline">重试</button>
          </div>
        )}

        <div className="hidden md:block">
          <div className={fluentTable.wrapper}>
            <table className={`${fluentTable.table} min-w-[685px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={`${fluentTable.th} w-12`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0078D4]"
                      checked={allSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(event) => props.onToggleAll(event.target.checked)}
                    />
                  </th>
                  {['批次号', '品种', '地块', '状态'].map(label => (
                    <th key={label} className={fluentTable.th}>{label}</th>
                  ))}
                  <th className={`${fluentTable.th} text-right`}>签发码数</th>
                  <th className={`${fluentTable.th} text-right`}>扫码量</th>
                  <th className={fluentTable.th}>最近更新</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {props.pagedData.map(batch => (
                  <tr
                    key={batch.id}
                    className={`${fluentTable.row} ${props.selectedIds.has(batch.id) ? fluentTable.rowSelected : ''}`}
                  >
                    <td className={fluentTable.td}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#0078D4]"
                        checked={props.selectedIds.has(batch.id)}
                        onChange={(event) => props.onToggleOne(batch.id, event.target.checked)}
                      />
                    </td>
                    <td className={`${fluentTable.td} font-mono font-semibold`}>{batch.code}</td>
                    <td className={fluentTable.td}>{batch.type}</td>
                    <td className={fluentTable.td}>{batch.house}</td>
                    <td className={fluentTable.td}>
                      <span className={fluentStatusTag(statusTone(batch.stage))}>
                        {STATUS_LABEL[batch.stage] ?? batch.stage}
                      </span>
                    </td>
                    <td className={`${fluentTable.td} text-right font-mono`}>
                      {batch.generated.toLocaleString('zh-CN')}
                    </td>
                    <td className={`${fluentTable.td} text-right font-mono`}>
                      {batch.scanTotal.toLocaleString('zh-CN')}
                    </td>
                    <td className={fluentTable.td}>{batch.date}</td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="flex flex-wrap justify-end gap-1">
                        <button onClick={() => props.onDetail(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                          <Eye className="h-3.5 w-3.5" />查看
                        </button>
                        <button onClick={() => props.onGenerate(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                          <QrCode className="h-3.5 w-3.5" />生码
                        </button>
                        <BatchActionMenu
                          batch={batch}
                          open={desktopOpenMenuBatchId === batch.id}
                          onOpenChange={setDesktopOpenMenuBatchId}
                          exportingReportId={props.exportingReportId}
                          scanningCompliance={props.scanningCompliance}
                          onAnalyze={props.onAnalyze}
                          onCodes={props.onCodes}
                          onCompliance={props.onCompliance}
                          onCredentials={props.onCredentials}
                          onProfit={props.onProfit}
                          onReport={props.onReport}
                          onDelete={props.onDelete}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!props.loading && props.filteredData.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-[#605E5C]">
                      暂无符合条件的批次
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ul aria-label="批次列表" className="space-y-3 bg-[#F5F5F5] p-3 md:hidden">
          {props.pagedData.map(batch => (
            <li
              key={batch.id}
              className={`border bg-white p-4 shadow-sm ${
                props.selectedIds.has(batch.id) ? 'border-[#0078D4]' : 'border-[#E1DFDD]'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`选择批次 ${batch.code}`}
                  checked={props.selectedIds.has(batch.id)}
                  onChange={(event) => props.onToggleOne(batch.id, event.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#0078D4]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-[#605E5C]">批次号</div>
                      <div className="mt-1 break-all font-mono text-sm font-semibold text-[#242424]">
                        {batch.code}
                      </div>
                    </div>
                    <span className={fluentStatusTag(statusTone(batch.stage))}>
                      {STATUS_LABEL[batch.stage] ?? batch.stage}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-[#605E5C]">品种</dt>
                      <dd className="mt-1 font-semibold text-[#242424]">{batch.type}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#605E5C]">地块</dt>
                      <dd className="mt-1 font-semibold text-[#242424]">{batch.house}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#605E5C]">签发码数</dt>
                      <dd className="mt-1 font-mono text-[#242424]">{batch.generated.toLocaleString('zh-CN')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#605E5C]">扫码量</dt>
                      <dd className="mt-1 font-mono text-[#242424]">{batch.scanTotal.toLocaleString('zh-CN')}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-[#605E5C]">最近更新</dt>
                      <dd className="mt-1 text-[#242424]">{batch.date}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EDEBE9] pt-3">
                    <button
                      type="button"
                      aria-label={`查看批次 ${batch.code}`}
                      onClick={() => props.onDetail(batch.id)}
                      className={fluentButton('secondary')}
                    >
                      <Eye className="h-4 w-4" />查看
                    </button>
                    <button
                      type="button"
                      aria-label={`为批次 ${batch.code} 生码`}
                      onClick={() => props.onGenerate(batch.id)}
                      className={fluentButton('primary')}
                    >
                      <QrCode className="h-4 w-4" />生码
                    </button>
                    <BatchActionMenu
                      batch={batch}
                      open={mobileOpenMenuBatchId === batch.id}
                      onOpenChange={setMobileOpenMenuBatchId}
                      exportingReportId={props.exportingReportId}
                      scanningCompliance={props.scanningCompliance}
                      onAnalyze={props.onAnalyze}
                      onCodes={props.onCodes}
                      onCompliance={props.onCompliance}
                      onCredentials={props.onCredentials}
                      onProfit={props.onProfit}
                      onReport={props.onReport}
                      onDelete={props.onDelete}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
          {!props.loading && props.filteredData.length === 0 && (
            <li className="border border-[#E1DFDD] bg-white p-8 text-center text-sm text-[#605E5C]">
              暂无符合条件的批次
            </li>
          )}
        </ul>
      </div>

      {props.filteredData.length > 0 && (
        <div className="flex shrink-0 flex-col gap-3 border-t border-[#E1DFDD] bg-white px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-[#605E5C]">
            共 <span className="font-semibold text-[#242424]">{props.filteredData.length}</span> 个批次，
            第 {props.page} / {props.totalPages} 页
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => props.onPage(Math.max(1, props.page - 1))}
              disabled={props.page <= 1}
              className={fluentButton('secondary')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />上一页
            </button>
            {Array.from({ length: props.totalPages }, (_, index) => index + 1).map(page => (
              <button
                key={page}
                onClick={() => props.onPage(page)}
                className={`h-8 min-w-8 rounded-[4px] border px-2 text-sm font-semibold ${
                  page === props.page
                    ? 'border-[#0078D4] bg-[#0078D4] text-white'
                    : 'border-[#C8C6C4] bg-white text-[#242424]'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => props.onPage(Math.min(props.totalPages, props.page + 1))}
              disabled={props.page >= props.totalPages}
              className={fluentButton('secondary')}
            >
              下一页<ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
