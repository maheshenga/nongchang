import { Eye, X } from 'lucide-react';
import type { getBatchLifecycle } from '../../api/batches';
import { STATUS_LABEL, type ViewBatch } from '../BatchAdmin.model';

type Lifecycle = Awaited<ReturnType<typeof getBatchLifecycle>>;

export function BatchLifecycleDialog({ batch, data, loading, onClose }: { batch?: ViewBatch; data: Lifecycle | null; loading: boolean; onClose(): void }) {
  const records = (data?.farmRecords ?? []) as Array<Record<string, unknown>>;
  const events = (data?.traceEvents ?? []) as Array<Record<string, unknown>>;
  const scans = (data?.recentScans ?? []) as Array<Record<string, unknown>>;
  return <div className="absolute inset-0 z-[75] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
    <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[6px] bg-white shadow-lg">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 p-6"><h3 className="flex items-center gap-3 text-lg font-bold text-slate-800"><Eye className="h-5 w-5" />批次详情 · <span className="font-mono text-slate-600">{batch?.code}</span>{batch && <span className="rounded-md border px-2 py-0.5 text-xs font-bold">{STATUS_LABEL[batch.stage] ?? batch.stage}</span>}</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">{loading && <div className="py-12 text-center text-sm text-slate-400">加载中…</div>}{!loading && data && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['品种', batch?.type], ['种植日期', batch?.date], ['已签发码数', data.codeCount ?? 0], ['累计扫码', data.scanTotal ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-[6px] border border-slate-100 bg-slate-50 p-4"><div className="mb-1 text-[10px] font-bold uppercase text-slate-400">{label}</div><div className="text-sm font-black text-slate-800">{value}</div></div>)}</div>
        <RecordSection title="农事记录" rows={records} dateKey="recordedAt" primaryKey="action" secondaryKey="note" empty="暂无农事记录" />
        <RecordSection title="溯源链路事件" rows={events} dateKey="occurredAt" primaryKey="eventType" secondaryKey="description" empty="暂无溯源事件" />
        <div><h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">近期扫码 ({scans.length})</h4>{scans.length === 0 ? <p className="text-xs text-slate-400">暂无扫码记录</p> : <div className="flex flex-wrap gap-2">{scans.map((scan, index) => <span key={index} className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-600">{scan.scannedAt ? String(scan.scannedAt).slice(0, 16).replace('T', ' ') : ''}</span>)}</div>}</div>
      </>}</div>
    </div>
  </div>;
}

function RecordSection({ title, rows, dateKey, primaryKey, secondaryKey, empty }: { title: string; rows: Array<Record<string, unknown>>; dateKey: string; primaryKey: string; secondaryKey: string; empty: string }) {
  return <div><h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">{title} ({rows.length})</h4>{rows.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : <div className="space-y-2">{rows.map((row, index) => <div key={index} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-4 py-2.5 text-sm shadow-sm"><span className="shrink-0 font-mono text-xs text-slate-400">{row[dateKey] ? String(row[dateKey]).slice(0, 10) : ''}</span><span className="font-bold text-slate-700">{String(row[primaryKey] ?? '')}</span><span className="truncate text-xs text-slate-500">{String(row[secondaryKey] ?? '')}</span></div>)}</div>}</div>;
}
