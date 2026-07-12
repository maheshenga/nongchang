import { useEffect, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Layers, Loader2, Mail, RefreshCw, X } from 'lucide-react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import DemoBadge from './DemoBadge';
import { DemoKpiGrid } from './dashboard-demo/DemoKpiGrid';
import { DemoMapPanel } from './dashboard-demo/DemoMapPanel';
import { DemoChartsPanel } from './dashboard-demo/DemoChartsPanel';
import { DemoOperationsPanel } from './dashboard-demo/DemoOperationsPanel';
import { useDashboardDemoLayout } from './dashboard-demo/useDashboardDemoLayout';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface DashboardDemoProps { onExitDemo(): void }

export default function DashboardDemo({ onExitDemo }: DashboardDemoProps) {
  const layout = useDashboardDemoLayout();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLayout, setPdfLayout] = useState('standard');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [alerts, setAlerts] = useState<Array<{ id: string; message: string }>>([]);

  useEffect(() => {
    const receive = (event: Event) => {
      const message = String((event as CustomEvent<{ message?: string }>).detail?.message ?? '演示偏离预警');
      const alert = { id: `${Date.now()}`, message };
      setAlerts(previous => [...previous, alert]);
      window.setTimeout(() => setAlerts(previous => previous.filter(item => item.id !== alert.id)), 8000);
    };
    window.addEventListener('farm-deviation-alert', receive);
    return () => window.removeEventListener('farm-deviation-alert', receive);
  }, []);

  const exportPdfExample = () => {
    setExportingPdf(true);
    window.setTimeout(() => { setExportingPdf(false); setPdfOpen(false); }, 500);
  };

  return <div className={`relative space-y-4 overflow-hidden pb-8 ${layout.presentationMode ? 'min-h-screen bg-slate-100 p-4' : ''}`}>
    {layout.presentationMode && <button onClick={() => layout.togglePresentationMode(false)} className="fixed bottom-8 right-8 z-[100] flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg"><X className="h-5 w-5" />退出全屏演示</button>}
    {alerts.length > 0 && <div className="fixed right-6 top-6 z-[100] space-y-2">{alerts.map(alert => <div key={alert.id} className="flex w-80 items-start justify-between rounded-xl bg-red-600 p-4 text-sm text-white shadow-lg"><span><b>演示偏离预警</b><br />{alert.message}</span><button onClick={() => setAlerts(previous => previous.filter(item => item.id !== alert.id))}><X className="h-4 w-4" /></button></div>)}</div>}
    <header className="flex flex-wrap items-center justify-between gap-3 px-2 text-sm"><h2 className="flex items-center gap-2 font-bold text-slate-800">可拖拽自定义监控看板 <DemoBadge /></h2><div className="flex flex-wrap items-center gap-2">
      <button onClick={onExitDemo} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs"><ArrowLeft className="h-3 w-3" />返回生产状态</button>
      <button onClick={() => setPdfOpen(true)} className="flex items-center gap-1.5 rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700"><FileSpreadsheet className="h-3 w-3" />演示经营简报 (PDF 示例)</button>
      <button onClick={() => layout.togglePresentationMode(true)} className="flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700"><Layers className="h-3 w-3" />全屏演示模式</button>
      <button onClick={() => setAutoRefresh(value => !value)} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs"><Loader2 className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} />{autoRefresh ? '演示刷新标记: 开启' : '演示刷新标记: 关闭'}</button>
      <button onClick={layout.resetLayout} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs"><RefreshCw className="h-3 w-3" />重置布局</button>
      <button onClick={() => setEmailOpen(true)} className="flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700"><Mail className="h-3 w-3" />邮件推送示例</button>
    </div></header>
    <ResponsiveGridLayout className="layout" layouts={layout.layouts} onLayoutChange={layout.onLayoutChange} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} rowHeight={70} draggableHandle=".drag-handle">
      <div key="kpis"><DemoKpiGrid presentationMode={layout.presentationMode} /></div>
      <div key="charts"><DemoChartsPanel presentationMode={layout.presentationMode} /></div>
      <div key="map"><DemoMapPanel presentationMode={layout.presentationMode} /></div>
      <div key="operations"><DemoOperationsPanel presentationMode={layout.presentationMode} /></div>
    </ResponsiveGridLayout>
    {emailOpen && <EmailDemoModal onClose={() => setEmailOpen(false)} />}
    {pdfOpen && <PdfDemoModal layout={pdfLayout} setLayout={setPdfLayout} exporting={exportingPdf} onExport={exportPdfExample} onClose={() => setPdfOpen(false)} />}
  </div>;
}

function EmailDemoModal({ onClose }: { onClose(): void }) {
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"><div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
    <div className="flex items-center justify-between border-b border-slate-100 p-5"><h3 className="flex items-center gap-2 font-bold text-slate-800"><Mail className="h-5 w-5 text-blue-500" />周期性邮件推送示例</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div>
    <div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700">接收人邮箱<input type="email" placeholder="demo@example.com" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" /></label><label className="block text-sm font-medium text-slate-700">推送频率<select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option>每周五 18:00 (周报)</option><option>每月1号 08:00 (月报)</option></select></label><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">演示设置不会创建真实邮件订阅。</p></div>
    <div className="flex justify-end gap-3 border-t bg-slate-50 p-5"><button onClick={onClose}>取消</button><button onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">保存演示设置</button></div>
  </div></div>;
}

function PdfDemoModal({ layout, setLayout, exporting, onExport, onClose }: { layout: string; setLayout(value: string): void; exporting: boolean; onExport(): void; onClose(): void }) {
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
    <div className="flex items-center justify-between border-b p-5"><h3 className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet className="h-5 w-5 text-indigo-600" />导出演示经营简报 (PDF 示例)</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div>
    <div className="space-y-5 bg-slate-50 p-6"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">目标年份<select className="mt-2 w-full rounded-lg border p-2"><option>2026 年度</option><option>2025 年度</option></select></label><label className="text-sm font-bold">目标地块<select className="mt-2 w-full rounded-lg border p-2"><option>所有演示地块汇总</option><option>高山温室A区</option></select></label></div><div className="rounded-xl border bg-white p-4"><p className="mb-3 text-sm font-bold">PDF 示例版式</p><div className="flex gap-3"><button onClick={() => setLayout('standard')} className={`flex-1 rounded-lg border-2 p-3 text-sm ${layout === 'standard' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>标准 A4 纵向</button><button onClick={() => setLayout('presentation')} className={`flex-1 rounded-lg border-2 p-3 text-sm ${layout === 'presentation' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>16:9 演示版</button></div></div><p className="text-xs text-slate-500">此处只演示报告配置和生成状态，不代表已生成真实经营报告。</p></div>
    <div className="flex justify-end gap-3 border-t p-5"><button onClick={onClose}>取消</button><button onClick={onExport} disabled={exporting} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{exporting && <Loader2 className="h-4 w-4 animate-spin" />}{exporting ? '生成 PDF 示例中...' : '确认导出演示报告'}</button></div>
  </div></div>;
}
