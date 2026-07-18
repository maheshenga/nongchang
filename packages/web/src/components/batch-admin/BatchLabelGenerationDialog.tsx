import { AlertTriangle, QrCode, X } from 'lucide-react';
import type { TraceLabelPaperSize } from '@nongchang/shared';
import type { ViewBatch } from '../BatchAdmin.model';

interface Props {
  batch: ViewBatch;
  amount: number;
  paperSize: TraceLabelPaperSize;
  generating: boolean;
  maxLabels: number;
  onAmountChange(amount: number): void;
  onPaperSizeChange(paperSize: TraceLabelPaperSize): void;
  onGenerate(): void;
  onClose(): void;
}

export function BatchLabelGenerationDialog(props: Props) {
  const valid = Number.isInteger(props.amount) && props.amount >= 1 && props.amount <= props.maxLabels;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="生成溯源标签" className="w-full max-w-lg overflow-hidden rounded-[6px] bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-[#E1DFDD] bg-[#EFF6FC] p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#242424]"><QrCode className="h-5 w-5 text-[#0078D4]" aria-hidden="true" />生成溯源标签</h2>
            <p className="mt-1 break-all text-sm text-[#605E5C]">{props.batch.code} · {props.batch.type}</p>
          </div>
          <button type="button" onClick={props.onClose} disabled={props.generating} aria-label="关闭生成设置" title="关闭生成设置" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#8A8886] disabled:cursor-not-allowed disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block text-sm font-medium text-[#323130]">纸张规格<select value={props.paperSize} disabled={props.generating} onChange={(event) => props.onPaperSizeChange(event.target.value as TraceLabelPaperSize)} className="mt-1 w-full border border-[#8A8886] bg-white px-3 py-2"><option value="A4">A4</option><option value="4x6">4x6</option><option value="2x1">2x1</option></select></label>
          <label className="block text-sm font-medium text-[#323130]">生成数量<input type="number" min={1} max={props.maxLabels} value={props.amount} disabled={props.generating} onChange={(event) => props.onAmountChange(Math.floor(Number(event.target.value)))} className="mt-1 w-full border border-[#8A8886] px-3 py-2 font-mono" /></label>
          {!valid && <p className="flex items-center gap-2 text-sm text-[#A4262C]" role="alert"><AlertTriangle className="h-4 w-4" aria-hidden="true" />生成数量须为 1 ~ {props.maxLabels} 的整数</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E1DFDD] p-4">
          <button type="button" onClick={props.onClose} disabled={props.generating} className="border border-[#8A8886] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">暂缓生成</button>
          <button type="button" onClick={props.onGenerate} disabled={!valid || props.generating} className="border border-[#0078D4] bg-[#0078D4] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{props.generating ? '生成中…' : '生成真实溯源码'}</button>
        </div>
      </div>
    </div>
  );
}
