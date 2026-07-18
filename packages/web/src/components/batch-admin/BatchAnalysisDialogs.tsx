import { AlertTriangle, Calculator, CheckCircle, ShieldCheck, TrendingUp, X } from 'lucide-react';
import { calculateMargin, type BatchComplianceReport, type ViewBatch } from '../BatchAdmin.model';

export interface PendingAction {
  type: 'export' | 'generate' | 'report';
  title: string;
  description: string;
  affectedCount: number;
  format?: string;
  batchId?: string;
  onConfirm(): Promise<void> | void;
}

interface Props {
  batches: ViewBatch[];
  profitBatchId: string | null;
  complianceBatchId: string | null;
  compliance: BatchComplianceReport | null;
  pending: PendingAction | null;
  busy: boolean;
  onCloseProfit(): void;
  onCloseCompliance(): void;
  onClosePending(): void;
}

export function BatchAnalysisDialogs(props: Props) {
  const profitBatch = props.batches.find(batch => batch.id === props.profitBatchId);
  const margin = profitBatch ? calculateMargin(profitBatch.inputCost, profitBatch.laborCost, profitBatch.sellPrice) : null;
  return <>
    {props.complianceBatchId && <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="合规探针"><div className="w-full max-w-xl overflow-hidden rounded-[6px] bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-[#E1DFDD] bg-[#EFF6FC] p-6"><h3 className="flex items-center gap-3 text-lg font-bold text-[#107C10]"><ShieldCheck className="h-5 w-5" />溯源法定合规性自动化探针</h3><button onClick={props.onCloseCompliance}><X className="h-5 w-5" /></button></div>
      <div className="p-8"><div className="mb-8 flex items-center gap-6 rounded-[6px] border border-slate-100 bg-slate-50 p-5"><div className="grid h-20 w-20 place-items-center rounded-full bg-[#DFF6DD] text-2xl font-black text-[#107C10]">{props.compliance?.score ?? 0}%</div><div><div className="font-black text-slate-800">{(props.compliance?.score ?? 0) >= 75 ? '接近完全符合法定花卉安全溯源配置规范' : '仍有关键溯源要素待补齐'}</div><div className="mt-1 text-xs text-slate-500">批次: <span className="font-mono">{props.complianceBatchId}</span></div></div></div>
        <div className="space-y-3">{(props.compliance?.checks ?? []).map(check => <div key={check.label} className={`flex items-center justify-between rounded-[6px] border p-4 ${check.ok ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}><span className="flex items-center gap-3 text-sm font-bold">{check.ok ? <CheckCircle className="h-4 w-4 text-[#107C10]" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{check.label}</span><span className="text-xs font-bold">{check.ok ? '已挂载' : '未达标'}</span></div>)}</div>
      </div>
    </div></div>}
    {profitBatch && margin && <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="利润分析"><div className="w-full max-w-lg overflow-hidden rounded-[6px] bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-purple-100 bg-[#EFF6FC] p-6"><h3 className="flex items-center gap-3 text-lg font-bold text-purple-900"><TrendingUp className="h-5 w-5" />单批次利润率推演 · <span className="font-mono text-xs">{profitBatch.code}</span></h3><button onClick={props.onCloseProfit}><X className="h-5 w-5" /></button></div>
      <div className="space-y-6 p-8"><div className="grid grid-cols-2 gap-4"><Metric label="投入品成本" value={profitBatch.inputCost} /><Metric label="人工及地租" value={profitBatch.laborCost} /></div><div className="flex items-center justify-between rounded-[6px] border border-purple-200 bg-[#EFF6FC] p-6"><div><div className="text-xs font-bold text-indigo-900">预期成交规模</div><div className="font-mono text-4xl font-black text-[#5B2E91]">¥{margin.expectedSell.toLocaleString()}</div></div><div className="text-right"><div className="text-xs font-bold text-slate-500">模型毛利率</div><div className="text-4xl font-black text-[#107C10]">{margin.text}</div></div></div><p className="flex items-start gap-2 rounded-[6px] border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500"><Calculator className="h-4 w-4" />指标来自当前批次接口返回的投入、人工与售价数据，仅供经营分析。</p></div>
    </div></div>}
    {props.pending && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"><div className="w-full max-w-md overflow-hidden rounded-[6px] bg-white shadow-lg"><div className="flex items-start gap-4 border-b border-slate-100 bg-slate-50 p-6"><AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" /><div><h3 className="mb-1 text-lg font-black text-slate-800">{props.pending.title}</h3><p className="text-sm font-medium leading-relaxed text-slate-600">{props.pending.description}</p><div className="mt-4 text-xs font-bold text-slate-500">影响范围: {props.pending.affectedCount} 个</div></div></div><div className="flex justify-end gap-3 p-5"><button onClick={props.onClosePending} disabled={props.busy} className="px-5 py-2 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">取消</button><button onClick={() => void props.pending?.onConfirm()} disabled={props.busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{props.busy ? '处理中…' : `确认 ${props.pending.type === 'generate' ? '生成' : '导出'}`}</button></div></div></div>}
  </>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[6px] border border-slate-100 bg-slate-50 p-5"><div className="mb-1 text-[10px] font-bold uppercase text-slate-400">{label}</div><div className="font-mono text-xl font-black text-slate-800">¥{value.toLocaleString()}</div></div>;
}
