import { ChevronDown, Download, FileSpreadsheet, FileText, Filter, Layers, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import type { Field } from '../../api/fields';
import { fluentButton, fluentInput, fluentSelect } from '../../ui/fluent';

interface Props {
  fields: Field[];
  searchCode: string;
  setSearchCode(value: string): void;
  filterType: string;
  setFilterType(value: string): void;
  filterHouse: string;
  setFilterHouse(value: string): void;
  filterDateRange: string;
  setFilterDateRange(value: string): void;
  showAdvancedFilter: boolean;
  setShowAdvancedFilter(value: boolean): void;
  clearFilters(): void;
  selectedCount: number;
  exportDropdownOpen: boolean;
  setExportDropdownOpen(value: boolean): void;
  exporting: string | null;
  onExport(format: 'pdf' | 'excel'): void;
  onCreate(): void;
  onReload(): void;
}

const cropOptions = <><option value="all">全部品种</option><option value="阳光玫瑰">阳光玫瑰</option><option value="美早">美早</option><option value="芍药">芍药</option></>;
const dateOptions = <><option value="all">全部日期</option><option value="2024">2024</option><option value="2023">2023</option></>;

export function BatchCommandBar(props: Props) {
  return <>
    <div className="shrink-0 border-b border-[#E1DFDD] bg-white px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-xs text-[#605E5C]">首页 / 批次管理</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-[#242424]">
            <span className="grid h-8 w-8 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]"><Layers className="h-4 w-4" /></span>
            批次全生命周期管理
          </h1>
          <p className="mt-1 text-sm text-[#605E5C]">管理种植、采收、包装、溯源码签发与扫码核验链路。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={props.onCreate} className={fluentButton('primary')}><Plus className="h-4 w-4" />新建批次</button>
          <div className="relative">
            <button onClick={() => props.setExportDropdownOpen(!props.exportDropdownOpen)} disabled={props.exporting !== null} className={fluentButton('secondary')}>
              {props.exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {props.exporting ? `正在导出 ${props.exporting.toUpperCase()}...` : props.selectedCount ? `导出 (${props.selectedCount})` : '导出'}
            </button>
            {props.exportDropdownOpen && <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-[4px] border border-[#E1DFDD] bg-white shadow-lg">
              <button onClick={() => props.onExport('pdf')} className="flex w-full items-center gap-2 border-b border-[#EDEBE9] px-3 py-2 text-left text-sm hover:bg-[#F3F2F1]"><FileText className="h-4 w-4 text-[#A4262C]" />标准 PDF 溯源版</button>
              <button onClick={() => props.onExport('excel')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F3F2F1]"><FileSpreadsheet className="h-4 w-4 text-[#107C10]" />原始 Excel 数据表</button>
            </div>}
          </div>
          <button onClick={() => props.setShowAdvancedFilter(!props.showAdvancedFilter)} className={fluentButton('secondary')}><Filter className="h-4 w-4" />筛选<ChevronDown className={`h-3.5 w-3.5 ${props.showAdvancedFilter ? 'rotate-180' : ''}`} /></button>
          <button onClick={props.onReload} className={fluentButton('subtle')}><RefreshCw className="h-4 w-4" />刷新</button>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" /><input placeholder="按批次号搜索" value={props.searchCode} onChange={e => props.setSearchCode(e.target.value)} className={`${fluentInput} w-full pl-8`} /></div>
        <select value={props.filterType} onChange={e => props.setFilterType(e.target.value)} className={`${fluentSelect} w-full max-w-[180px]`}>{cropOptions}</select>
        <select value={props.filterHouse} onChange={e => props.setFilterHouse(e.target.value)} className={`${fluentSelect} w-full max-w-[180px]`}><option value="all">全部地块</option>{props.fields.slice(0, 6).map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
        <select value={props.filterDateRange} onChange={e => props.setFilterDateRange(e.target.value)} className={`${fluentSelect} w-full max-w-[180px]`}>{dateOptions}</select>
      </div>
    </div>
    {props.showAdvancedFilter && <div className="shrink-0 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
      <div className="mb-3 text-xs font-semibold text-[#605E5C]">高级筛选</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-48 flex-col gap-1 text-xs font-semibold text-[#605E5C]">品种<select value={props.filterType} onChange={e => props.setFilterType(e.target.value)} className={`${fluentSelect} w-full`}>{cropOptions}</select></label>
        <label className="flex w-56 flex-col gap-1 text-xs font-semibold text-[#605E5C]">地块<select value={props.filterHouse} onChange={e => props.setFilterHouse(e.target.value)} className={`${fluentSelect} w-full`}><option value="all">全部地块</option>{props.fields.slice(0, 6).map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
        <label className="flex w-48 flex-col gap-1 text-xs font-semibold text-[#605E5C]">日期<select value={props.filterDateRange} onChange={e => props.setFilterDateRange(e.target.value)} className={`${fluentSelect} w-full`}>{dateOptions}</select></label>
        <button type="button" onClick={props.clearFilters} className={fluentButton('secondary')}>清空筛选</button>
      </div>
    </div>}
  </>;
}
