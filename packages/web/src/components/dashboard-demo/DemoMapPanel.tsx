import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MapPin, PenTool, ShieldCheck, X } from 'lucide-react';
import { topologyNodes } from './demo-data';
import type { DemoPanelProps } from './demo-types';

type Node = (typeof topologyNodes)[number];

export function DemoMapPanel({ presentationMode }: DemoPanelProps) {
  const [activeNode, setActiveNode] = useState<Node | null>(null);
  const [drawingFence, setDrawingFence] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const simulate = (mode: 'fence' | 'annotation') => {
    if (mode === 'fence') setDrawingFence(value => !value); else setAnnotating(value => !value);
    setNotice(mode === 'fence' ? '【演示样例】电子围栏绘制状态已切换。' : '【演示样例】地图标注状态已切换。');
  };

  return <section className={`relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-4 text-white ${presentationMode ? 'text-base' : ''}`}>
    <div className="drag-handle flex cursor-move items-center justify-between"><h3 className="font-bold">演示供应链拓扑与 GIS</h3><div className="flex gap-2"><button onClick={() => simulate('fence')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${drawingFence ? 'bg-emerald-500' : 'bg-white/10'}`}><ShieldCheck className="h-3 w-3" />电子围栏</button><button onClick={() => simulate('annotation')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${annotating ? 'bg-blue-500' : 'bg-white/10'}`}><PenTool className="h-3 w-3" />地图标注</button></div></div>
    <div className="relative mt-4 h-[72%] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_center,#1e3a5f,#0f172a_70%)]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true"><line x1="12%" y1="50%" x2="88%" y2="50%" stroke="#60a5fa" strokeWidth="3" strokeDasharray="8 8" /></svg>
      {topologyNodes.map((node, index) => <motion.button key={node.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: index * 0.1 }} onClick={() => setActiveNode(node)} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: node.x }}><span className="mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-blue-300 bg-blue-600 shadow-lg"><MapPin className="h-5 w-5" /></span><span className="mt-2 block whitespace-nowrap text-xs font-bold">{node.name}</span></motion.button>)}
      <AnimatePresence>{activeNode && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/20 bg-slate-950/90 p-4"><button onClick={() => setActiveNode(null)} className="absolute right-3 top-3"><X className="h-4 w-4" /></button><div className="font-bold">{activeNode.name} · {activeNode.stock}</div>{activeNode.logs.map(log => <div key={log} className="mt-1 text-xs text-slate-300">{log}</div>)}</motion.div>}</AnimatePresence>
    </div>
    {notice && <div className="mt-3 flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-xs"><span>{notice}</span><button onClick={() => setNotice(null)}><X className="h-3 w-3" /></button></div>}
  </section>;
}
