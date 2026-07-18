import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, ScanLine, X } from 'lucide-react';
import type { TraceCode } from '../../api/trace';
import type { ViewBatch } from '../BatchAdmin.model';

interface Props {
  batch?: ViewBatch;
  codes: TraceCode[];
  loading: boolean;
  maxExport: number;
  traceUrl(code: string): string;
  onCopy(code: string): void;
  onExport(codeIds?: string[]): void;
  onClose(): void;
}

export function BatchCodesDialog(props: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedCodes = useMemo(() => props.codes.filter((code) => selectedIds.has(code.id)), [props.codes, selectedIds]);
  const oversized = props.codes.length > props.maxExport;
  useEffect(() => setSelectedIds(new Set()), [props.batch?.id]);

  const toggle = (id: string, checked: boolean) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (checked) {
      if (next.size >= props.maxExport) return previous;
      next.add(id);
    } else next.delete(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="已生成溯源码">
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[6px] bg-white shadow-lg">
        <div className="flex min-w-0 shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-violet-50 p-5">
          <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-lg font-bold text-violet-900"><ScanLine className="h-5 w-5 shrink-0" aria-hidden="true" />已生成溯源码<span className="break-all font-mono text-violet-700">{props.batch?.code}</span><span className="border border-violet-200 bg-white px-2 py-0.5 font-mono text-xs text-violet-600">{props.codes.length} 个</span></h3>
          <button type="button" onClick={props.onClose} aria-label="关闭已生成码" title="关闭已生成码" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-violet-300"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E1DFDD] px-5 py-3 text-sm">
          <span className="mr-auto font-medium">已选择 {selectedIds.size} / {props.maxExport}</span>
          {oversized && <span className="w-full text-[#A4262C]">单次最多 {props.maxExport}，请分批选择</span>}
          <button type="button" onClick={() => { if (!oversized) setSelectedIds(new Set(props.codes.map((code) => code.id))); }} disabled={props.loading || oversized || props.codes.length === 0} className="border border-[#8A8886] px-3 py-1.5 disabled:opacity-50">全选</button>
          {oversized && <button type="button" onClick={() => setSelectedIds(new Set(props.codes.slice(0, props.maxExport).map((code) => code.id)))} className="border border-[#8A8886] px-3 py-1.5">选择前 {props.maxExport} 个</button>}
          <button type="button" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0} className="border border-[#8A8886] px-3 py-1.5 disabled:opacity-50">取消选择</button>
          <button type="button" onClick={() => props.onExport(selectedCodes.map((code) => code.id))} disabled={selectedCodes.length === 0} className="border border-[#0078D4] bg-[#0078D4] px-3 py-1.5 font-semibold text-white disabled:opacity-50">导出选中（{selectedCodes.length}）</button>
          <button type="button" onClick={() => props.onExport()} disabled={props.loading || props.codes.length === 0 || oversized} className="border border-[#0078D4] px-3 py-1.5 font-semibold text-[#0078D4] disabled:opacity-50">导出全部</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {props.loading && <div className="py-12 text-center text-sm text-slate-400">加载中…</div>}
          {!props.loading && props.codes.length === 0 && <p className="py-12 text-center text-sm text-slate-400">该批次尚未生成任何溯源码</p>}
          {!props.loading && <div className="space-y-2">{props.codes.map((code) => {
            const selected = selectedIds.has(code.id);
            return <div key={code.id} className="flex min-w-0 flex-wrap items-center gap-3 border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <input type="checkbox" checked={selected} disabled={!selected && selectedIds.size >= props.maxExport} onChange={(event) => toggle(code.id, event.target.checked)} aria-label={`选择溯源码 ${code.code}`} />
              <span className="min-w-0 flex-1 break-all font-mono text-sm font-bold text-slate-800">{code.code}</span><span className="shrink-0 text-xs text-slate-400">扫码 <b className="font-mono text-blue-600">{code.scanCount}</b> 次</span>
              <button type="button" onClick={() => props.onCopy(code.code)} className="flex items-center gap-1 text-xs font-bold text-violet-600"><Copy className="h-3 w-3" aria-hidden="true" />复制链接</button><a href={props.traceUrl(code.code)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold text-blue-600"><ExternalLink className="h-3 w-3" aria-hidden="true" />打开</a>
            </div>;
          })}</div>}
        </div>
      </div>
    </div>
  );
}
