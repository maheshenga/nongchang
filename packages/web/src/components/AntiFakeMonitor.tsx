import React, { useState, useEffect } from 'react';
import { AlertOctagon, MapPin, ShieldAlert, Monitor, Activity, Database, CheckCircle } from 'lucide-react';
import DemoBadge from './DemoBadge';

const MOCK_SCANS = [
  { id: '1', qrCode: 'ORC-8901-A42', time: '10:42:15', loc: '北京朝阳', ip: '114.240.2.**', status: 'normal' },
  { id: '2', qrCode: 'ORC-8903-B02', time: '10:41:20', loc: '上海徐汇', ip: '202.96.209.**', status: 'normal' },
  { id: '3', qrCode: 'ORC-8902-C99', time: '10:39:05', loc: '广东深圳', ip: '113.116.12.**', status: 'normal' },
];

export default function AntiFakeMonitor() {
  const [scans, setScans] = useState(MOCK_SCANS);
  const [alerts, setAlerts] = useState<{qrCode: string, locations: string[], count: number}[]>([]);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
       const random = Math.random();
       if (random > 0.7) {
          // Trigger a fake scan
          const maliciousQr = 'ORC-8904-X77';
          const newLocations = ['浙江杭州', '福建福州', '湖北武汉'];
          const loc = newLocations[Math.floor(Math.random() * newLocations.length)];
          const newScan = {
            id: Date.now().toString(),
            qrCode: maliciousQr,
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            loc: loc,
            ip: '112.53.' + Math.floor(Math.random()*255) + '.**',
            status: 'anomaly'
          };
          
          setScans(prev => [newScan, ...prev].slice(0, 8));
          
          setAlerts(prev => {
             const existing = prev.find(a => a.qrCode === maliciousQr);
             if (existing) {
                if (!existing.locations.includes(loc)) {
                   return prev.map(a => a.qrCode === maliciousQr ? { ...a, locations: [...a.locations, loc], count: a.count + 1 } : a);
                }
                return prev.map(a => a.qrCode === maliciousQr ? { ...a, count: a.count + 1 } : a);
             } else {
                return [{ qrCode: maliciousQr, locations: [loc], count: 1 }, ...prev].slice(0, 4);
             }
          });
       } else {
          // normal scan
          const id = Date.now().toString();
          setScans(prev => [{ id, qrCode: 'ORC-' + Math.floor(Math.random()*9000+1000) + '-NN', time: new Date().toLocaleTimeString('en-US', { hour12: false }), loc: '江苏南京', ip: '114.114.114.**', status: 'normal' }, ...prev].slice(0, 8));
       }
    }, 3000);
    return () => clearInterval(interval);
  }, [isLive]);

  const [toastMessage, setToastMessage] = useState('');
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleFreeze = (qrCode: string) => {
     setAlerts(prev => prev.filter(a => a.qrCode !== qrCode));
     setScans(prev => prev.map(s => s.qrCode === qrCode ? { ...s, status: 'frozen' } : s));
     showToast(`已成功针对全网节点下发冻结指令，阻断解析 [${qrCode}]`);
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
       <div className="w-full md:w-1/3 flex flex-col">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                溯源防伪监控看板
                <DemoBadge />
             </h3>
             <button 
               onClick={() => setIsLive(!isLive)}
               className={`text-[10px] px-2 py-1 rounded border font-bold flex items-center gap-1 ${isLive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
             >
               {isLive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
               {isLive ? '实时监控中' : '监控已暂停'}
             </button>
          </div>
          
          <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex-1 overflow-y-auto">
             <h4 className="text-xs font-bold text-red-800 mb-3 flex items-center gap-1"><AlertOctagon className="w-4 h-4" /> 异常高频/异地扫码预警</h4>
             {alerts.length === 0 ? (
               <div className="text-sm text-red-400 flex flex-col items-center justify-center p-4">
                 <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                 暂未监测到异常复用
               </div>
             ) : (
               <div className="space-y-3">
                 {alerts.map((alert, i) => (
                   <div key={i} className="bg-white p-3 rounded shadow-sm border border-red-200">
                     <div className="flex justify-between items-start mb-1">
                       <span className="font-mono text-red-700 font-bold text-xs">{alert.qrCode}</span>
                       <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">疑防造假</span>
                     </div>
                     <p className="text-[10px] text-slate-600">在短时间内被扫描 <span className="font-bold text-red-600">{alert.count}</span> 次</p>
                     <div className="mt-2 text-[10px] text-slate-500 flex gap-1 items-start">
                       <MapPin className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                       <div className="flex flex-wrap gap-1">
                         {alert.locations.map((l, idx) => <span key={idx} className="bg-slate-100 px-1 rounded">{l}</span>)}
                       </div>
                     </div>
                     <button onClick={() => handleFreeze(alert.qrCode)} className="mt-2 w-full text-[10px] bg-red-600 hover:bg-red-700 text-white py-1 rounded font-medium transition-colors">自动冻结该溯源码</button>
                   </div>
                 ))}
               </div>
             )}
          </div>
       </div>

       <div className="w-full md:w-2/3 flex flex-col">
         <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" /> 全网一物一码实时扫码日志反馈</h4>
         </div>
         <div className="flex-1 overflow-y-auto pr-2">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                <tr>
                   <th className="py-2 px-3 font-medium">标签流水号</th>
                   <th className="py-2 px-3 font-medium">发生时间</th>
                   <th className="py-2 px-3 font-medium">地理定位</th>
                   <th className="py-2 px-3 font-medium">终端IP</th>
                   <th className="py-2 px-3 font-medium">状态验证</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scans.map(scan => (
                   <tr key={scan.id} className={scan.status === 'anomaly' ? 'bg-red-50/50 text-red-900' : 'hover:bg-slate-50'}>
                      <td className="py-2 px-3 font-mono font-medium">{scan.qrCode}</td>
                      <td className="py-2 px-3">{scan.time}</td>
                      <td className="py-2 px-3">{scan.loc}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{scan.ip}</td>
                      <td className="py-2 px-3">
                        {scan.status === 'anomaly' ? (
                           <span className="text-red-600 font-bold flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> 阻断</span>
                        ) : scan.status === 'frozen' ? (
                           <span className="text-slate-500 font-bold flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> 已封禁</span>
                        ) : (
                           <span className="text-emerald-500 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 正常</span>
                        )}
                      </td>
                   </tr>
                ))}
              </tbody>
            </table>
         </div>
       </div>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
