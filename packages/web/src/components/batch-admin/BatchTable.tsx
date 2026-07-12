import { Calculator, ChevronLeft, ChevronRight, Eye, FileText, Loader2, QrCode, ScanLine, ShieldCheck, Trash2 } from 'lucide-react';
import { STATUS_LABEL, statusTone, type ViewBatch } from '../BatchAdmin.model';
import { fluentButton, fluentStatusTag, fluentTable } from '../../ui/fluent';

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
  onCodes(id: string): void;
  onCompliance(id: string): void;
  onCredentials(batch: ViewBatch): void;
  onProfit(id: string): void;
  onReport(id: string): void;
  onDelete(batch: ViewBatch): void;
}

export function BatchTable(props: Props) {
  const allSelected = props.filteredData.length > 0 && props.filteredData.every(batch => props.selectedIds.has(batch.id));
  const someSelected = props.filteredData.some(batch => props.selectedIds.has(batch.id));
  return <>
    <div className="min-h-0 flex-1 overflow-auto bg-white">
      {props.loading && <div className="p-8 text-center text-sm text-[#605E5C]">加载中...</div>}
      {props.error && <div className="p-8 text-center text-sm text-[#A4262C]">{props.error} <button onClick={props.onReload} className="ml-2 font-semibold underline">重试</button></div>}
      <div className={fluentTable.wrapper}><table className={fluentTable.table}>
        <thead className={fluentTable.thead}><tr>
          <th className={`${fluentTable.th} w-12`}><input type="checkbox" className="h-4 w-4 accent-[#0078D4]" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={e => props.onToggleAll(e.target.checked)} /></th>
          {['批次号', '品种', '地块', '状态'].map(label => <th key={label} className={fluentTable.th}>{label}</th>)}
          <th className={`${fluentTable.th} text-right`}>签发码数</th><th className={`${fluentTable.th} text-right`}>扫码量</th><th className={fluentTable.th}>最近更新</th><th className={`${fluentTable.th} text-right`}>操作</th>
        </tr></thead>
        <tbody>{props.pagedData.map(batch => <tr key={batch.id} className={`${fluentTable.row} ${props.selectedIds.has(batch.id) ? fluentTable.rowSelected : ''}`}>
          <td className={fluentTable.td}><input type="checkbox" className="h-4 w-4 accent-[#0078D4]" checked={props.selectedIds.has(batch.id)} onChange={e => props.onToggleOne(batch.id, e.target.checked)} /></td>
          <td className={`${fluentTable.td} font-mono font-semibold`}>{batch.code}</td><td className={fluentTable.td}>{batch.type}</td><td className={fluentTable.td}>{batch.house}</td>
          <td className={fluentTable.td}><span className={fluentStatusTag(statusTone(batch.stage))}>{STATUS_LABEL[batch.stage] ?? batch.stage}</span></td>
          <td className={`${fluentTable.td} text-right font-mono`}>{batch.generated.toLocaleString('zh-CN')}</td><td className={`${fluentTable.td} text-right font-mono`}>{batch.scanTotal.toLocaleString('zh-CN')}</td><td className={fluentTable.td}>{batch.date}</td>
          <td className={`${fluentTable.td} text-right`}><div className="flex max-w-[520px] flex-wrap justify-end gap-1">
            <button onClick={() => props.onDetail(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}><Eye className="h-3.5 w-3.5" />查看</button>
            <button onClick={() => props.onGenerate(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}><QrCode className="h-3.5 w-3.5" />生码</button>
            <button onClick={() => props.onCodes(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}><ScanLine className="h-3.5 w-3.5" />已生成码</button>
            <button onClick={() => props.onCompliance(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>{props.scanningCompliance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}合规</button>
            <button onClick={() => props.onCredentials(batch)} className={`${fluentButton('subtle')} whitespace-nowrap`}><ShieldCheck className="h-3.5 w-3.5" />资质</button>
            <button onClick={() => props.onProfit(batch.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}><Calculator className="h-3.5 w-3.5" />利润</button>
            <button onClick={() => props.onReport(batch.id)} disabled={props.exportingReportId === batch.id} className={`${fluentButton('subtle')} whitespace-nowrap`}>{props.exportingReportId === batch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}报告</button>
            <button onClick={() => props.onDelete(batch)} className={`${fluentButton('subtle')} whitespace-nowrap text-[#A4262C]`}><Trash2 className="h-3.5 w-3.5" />删除</button>
          </div></td>
        </tr>)}{!props.loading && props.filteredData.length === 0 && <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-[#605E5C]">暂无符合条件的批次</td></tr>}</tbody>
      </table></div>
    </div>
    {props.filteredData.length > 0 && <div className="flex shrink-0 flex-col gap-3 border-t border-[#E1DFDD] bg-white px-5 py-3 md:flex-row md:items-center md:justify-between">
      <div className="text-xs text-[#605E5C]">共 <span className="font-semibold text-[#242424]">{props.filteredData.length}</span> 个批次，第 {props.page} / {props.totalPages} 页</div>
      <div className="flex items-center gap-1"><button onClick={() => props.onPage(Math.max(1, props.page - 1))} disabled={props.page <= 1} className={fluentButton('secondary')}><ChevronLeft className="h-3.5 w-3.5" />上一页</button>
        {Array.from({ length: props.totalPages }, (_, i) => i + 1).map(page => <button key={page} onClick={() => props.onPage(page)} className={`h-8 min-w-8 rounded-[4px] border px-2 text-sm font-semibold ${page === props.page ? 'border-[#0078D4] bg-[#0078D4] text-white' : 'border-[#C8C6C4] bg-white text-[#242424]'}`}>{page}</button>)}
        <button onClick={() => props.onPage(Math.min(props.totalPages, props.page + 1))} disabled={props.page >= props.totalPages} className={fluentButton('secondary')}>下一页<ChevronRight className="h-3.5 w-3.5" /></button></div>
    </div>}
  </>;
}
