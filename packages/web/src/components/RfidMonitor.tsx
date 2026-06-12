import React, { useState, useEffect } from 'react';
import { ScanLine, AlertTriangle, Box, Clock, CheckCircle2, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_DATA = Array.from({ length: 24 }).map((_, i) => ({
  time: `${i}:00`,
  count: Math.floor(Math.random() * 50) + 10,
}));

export default function RfidMonitor() {
  const [logs, setLogs] = useState<{ id: string; rfid: string; time: string; status: 'ok' | 'conflict' }[]>([
    { id: '1', rfid: 'RFID-1002-AA', time: new Date().toLocaleTimeString(), status: 'ok' },
    { id: '2', rfid: 'RFID-1003-BB', time: new Date(Date.now() - 5000).toLocaleTimeString(), status: 'ok' },
  ]);
  
  const [activeAlert, setActiveAlert] = useState<{ id: string, rfid: string } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const isConflict = Math.random() > 0.85;
      const newLog: { id: string; rfid: string; time: string; status: 'ok' | 'conflict' } = {
        id: Date.now().toString(),
        rfid: `RFID-${Math.floor(Math.random() * 9000) + 1000}-${isConflict ? 'DUP' : 'OK'}`,
        time: new Date().toLocaleTimeString(),
        status: isConflict ? 'conflict' : 'ok',
      };

      if (isConflict) {
        setActiveAlert({ id: newLog.id, rfid: newLog.rfid });
        // Auto-dismiss alert after 5 seconds
        setTimeout(() => setActiveAlert(null), 5000);
      }

      setLogs(prev => [newLog, ...prev].slice(0, 10));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const totalScans = MOCK_DATA.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full cursor-move drag-handle relative">
      {/* Global Real-time Conflict Alert Overlay */}
      {activeAlert && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-right fade-in duration-300">
           <div className="bg-red-600 shadow-2xl rounded-xl p-4 flex items-start gap-4 border-2 border-red-400 w-80 text-white">
              <div className="bg-white p-2 rounded-full shrink-0 animate-pulse text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                 <h4 className="font-black text-sm mb-1 uppercase tracking-wider">RFID 入库异常告警</h4>
                 <p className="text-xs text-red-100 leading-relaxed font-medium">检测到重复的写入冲突序列，系统已自动阻断！<br/><span className="bg-red-800 px-1 py-0.5 rounded font-mono text-[10px] my-1 inline-block">关联标签: {activeAlert.rfid}</span><br/>请安排专员前往包装出卡机处核验。</p>
              </div>
              <button onClick={() => setActiveAlert(null)} className="text-white hover:text-red-200 shrink-0">
                 <X className="w-4 h-4" />
              </button>
           </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-indigo-500" />
          RFID/NFC 实时入库监控
        </h3>
        <span className="text-xs font-medium text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
          <Clock className="w-3 h-3" /> 近24小时扫码量: <span className="text-indigo-600 font-bold">{totalScans}</span>
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        <div className="w-full md:w-1/2 flex flex-col">
           <h4 className="text-xs font-bold text-slate-600 mb-2 uppercase">入库趋势报表</h4>
           <div className="flex-1 min-h-0">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={MOCK_DATA}>
                 <defs>
                   <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                     <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <XAxis dataKey="time" hide />
                 <Tooltip />
                 <Area type="monotone" dataKey="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorCount)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        <div className="w-full md:w-1/2 flex flex-col border border-slate-100 rounded-lg overflow-hidden relative">
          <div className="absolute top-0 right-0 bg-slate-900 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg z-10 flex items-center gap-1">
             <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div> LIVE
          </div>
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
             <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1"><Box className="w-3 h-3" /> 实时扫描动态流</h4>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50">
             {logs.map(log => (
               <div key={log.id} className={`p-2 rounded text-xs border flex items-center justify-between ${log.status === 'conflict' ? 'bg-red-50 border-red-200 animate-pulse' : 'bg-white border-slate-100'}`}>
                 <div className="flex items-center gap-2">
                   {log.status === 'conflict' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                   <span className={`font-mono font-bold ${log.status === 'conflict' ? 'text-red-700' : 'text-slate-700'}`}>{log.rfid}</span>
                 </div>
                 <div className="text-slate-400 text-[10px]">{log.time}</div>
                 {log.status === 'conflict' && (
                   <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded">ID冲突告警</span>
                 )}
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
