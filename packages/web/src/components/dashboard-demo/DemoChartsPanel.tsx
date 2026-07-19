import { useRef, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLORS, costData, cropData, ganttData, scanData, yieldData } from './demo-data';
import type { DemoPanelProps } from './demo-types';

export function DemoChartsPanel({ presentationMode }: DemoPanelProps) {
  const [exportRange, setExportRange] = useState('7days');
  const [exporting, setExporting] = useState(false);
  const [exportingGantt, setExportingGantt] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);

  const exportCsv = () => {
    setExporting(true);
    const content = scanData.map(row => `${row.name},${row.scans}`).join('\n');
    const url = URL.createObjectURL(new Blob([`Name,Scans\n${content}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = `demo_scan_data_${exportRange}.csv`; link.click(); URL.revokeObjectURL(url);
    setExporting(false);
  };

  const exportGantt = async () => {
    if (!ganttRef.current) return;
    setExportingGantt(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(ganttRef.current, { backgroundColor: '#ffffff', scale: 2 } as never);
      const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'demo-gantt.png'; link.click();
    } finally { setExportingGantt(false); }
  };

  return <section className={`h-full overflow-auto rounded-xl border border-slate-200 bg-white p-4 ${presentationMode ? 'text-base' : ''}`}>
    <div className="drag-handle mb-4 flex cursor-move flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-800">演示图表分析</h3><div className="flex gap-2"><select value={exportRange} onChange={event => setExportRange(event.target.value)} className="rounded border px-2 py-1 text-xs"><option value="7days">近7天</option><option value="30days">近30天</option></select><button onClick={exportCsv} className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">{exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}导出演示 CSV</button></div></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Chart title="扫码趋势"><AreaChart data={scanData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Area type="monotone" dataKey="scans" stroke="#3b82f6" fill="#dbeafe" /></AreaChart></Chart>
      <Chart title="示例品种结构"><PieChart><Pie data={cropData} dataKey="value" nameKey="name" outerRadius={80}>{cropData.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></Chart>
      <Chart title="月度示例产量"><BarChart data={yieldData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="春白芍" fill="#10b981" /><Bar dataKey="紫凤朝阳" fill="#8b5cf6" /></BarChart></Chart>
      <Chart title="投入产出示例"><RadarChart data={costData}><PolarGrid /><PolarAngleAxis dataKey="subject" /><Radar dataKey="成本投入" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} /><Radar dataKey="产出预期" stroke="#10b981" fill="#10b981" fillOpacity={0.2} /><Legend /></RadarChart></Chart>
    </div>
    <div ref={ganttRef} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-bold">演示种植排期</h4><button onClick={() => void exportGantt()} className="flex items-center gap-1 text-xs font-bold text-indigo-700">{exportingGantt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}导出甘特图 PNG</button></div>{ganttData.map(item => <div key={item.task} className="mb-2 grid grid-cols-[90px_1fr] items-center gap-2 text-xs"><span>{item.task}</span><div className="h-5 rounded bg-slate-200"><div className="h-full rounded bg-indigo-500" style={{ marginLeft: `${item.start / 1.2}%`, width: `${item.duration / 1.2}%` }} /></div></div>)}</div>
  </section>;
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="h-64 rounded-xl border border-slate-200 p-3"><h4 className="mb-2 text-sm font-bold text-slate-700">{title}</h4><ResponsiveContainer width="100%" height="88%">{children as never}</ResponsiveContainer></div>;
}
