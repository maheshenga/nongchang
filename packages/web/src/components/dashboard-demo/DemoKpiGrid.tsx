import { AlertTriangle, CloudRainWind, Layers, ScanLine, Sprout, Smartphone } from 'lucide-react';
import DemoBadge from '../DemoBadge';
import { farmAlerts } from './demo-data';
import type { DemoPanelProps } from './demo-types';

const kpis = [
  { label: '演示在管批次', value: '128', hint: '模拟展示值', icon: Layers, color: 'text-blue-600' },
  { label: '演示培育株数', value: '26,300', hint: '模拟展示值', icon: Sprout, color: 'text-[#107C10]' },
  { label: '演示扫码次数', value: '19,930', hint: '最近 7 天示例', icon: ScanLine, color: 'text-violet-600' },
  { label: '演示终端覆盖', value: '42', hint: '模拟展示值', icon: Smartphone, color: 'text-amber-600' },
];

export function DemoKpiGrid({ presentationMode }: DemoPanelProps) {
  return <section className={`h-full overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 ${presentationMode ? 'text-base' : ''}`}>
    <div className="drag-handle mb-4 flex cursor-move items-center justify-between"><h3 className="font-bold text-slate-800">演示运营概览 <DemoBadge /></h3><span className="text-xs text-slate-500">可拖拽面板</span></div>
    <div className="grid gap-3 md:grid-cols-3">{farmAlerts.map(alert => <div key={alert.title} className={`rounded-lg border-l-4 bg-white p-3 shadow-sm ${alert.tone === 'red' ? 'border-red-500' : alert.tone === 'amber' ? 'border-amber-500' : 'border-blue-500'}`}><div className="flex items-center gap-2 text-sm font-bold text-slate-800">{alert.tone === 'blue' ? <CloudRainWind className="h-4 w-4 text-blue-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{alert.title}</div><p className="mt-1 text-xs text-slate-500">{alert.detail}</p></div>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(item => <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><item.icon className={`h-5 w-5 ${item.color}`} /><div className="mt-3 text-xs font-bold text-slate-500">{item.label}</div><div className="mt-1 text-2xl font-black text-slate-900">{item.value}</div><div className="text-[10px] text-slate-400">{item.hint}</div></article>)}</div>
  </section>;
}
