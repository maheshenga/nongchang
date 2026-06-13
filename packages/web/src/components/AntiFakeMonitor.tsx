import { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, MapPin, ShieldAlert, Activity, CheckCircle, RefreshCw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { listScans, listAlerts, freezeCode, unfreezeCode } from '../api/anti-fake';

export default function AntiFakeMonitor() {
  const { data: scans, loading: scansLoading, error: scansError, reload: reloadScans } = useApi(listScans);
  const { data: alerts, error: alertsError, reload: reloadAlerts } = useApi(listAlerts);
  const [toastMessage, setToastMessage] = useState('');

  const reloadAll = useCallback(() => { void reloadScans(); void reloadAlerts(); }, [reloadScans, reloadAlerts]);

  useEffect(() => {
    const t = setInterval(reloadAll, 10_000);
    return () => clearInterval(t);
  }, [reloadAll]);

  const showToast = (m: string) => { setToastMessage(m); setTimeout(() => setToastMessage(''), 3000); };

  const handleFreeze = async (code: string) => {
    try { await freezeCode(code); showToast(`已冻结溯源码 [${code}]，公开溯源将被拦截`); reloadAll(); }
    catch (e) { showToast(e instanceof Error ? e.message : '冻结失败'); }
  };
  const handleUnfreeze = async (code: string) => {
    try { await unfreezeCode(code); showToast(`已解冻溯源码 [${code}]`); reloadAll(); }
    catch (e) { showToast(e instanceof Error ? e.message : '解冻失败'); }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="w-full md:w-1/3 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            溯源防伪监控看板
          </h3>
          <button onClick={reloadAll} aria-label="刷新监控数据"
            className="text-[10px] px-2 py-1 rounded border font-bold flex items-center gap-1 bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100">
            <RefreshCw className="w-3 h-3" /> 刷新
          </button>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex-1 overflow-y-auto">
          <h4 className="text-xs font-bold text-red-800 mb-3 flex items-center gap-1"><AlertOctagon className="w-4 h-4" /> 异常高频/异地扫码预警</h4>
          {alertsError ? (
            <div className="text-sm text-red-500 p-2">加载告警失败：{alertsError}</div>
          ) : (alerts ?? []).length === 0 ? (
            <div className="text-sm text-red-400 flex flex-col items-center justify-center p-4">
              <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
              暂未监测到异常复用
            </div>
          ) : (
            <div className="space-y-3">
              {(alerts ?? []).map((alert) => (
                <div key={alert.code} className="bg-white p-3 rounded shadow-sm border border-red-200">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-red-700 font-bold text-xs">{alert.code}</span>
                    <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{alert.frozen ? '已冻结' : '疑防造假'}</span>
                  </div>
                  <p className="text-[10px] text-slate-600">时间窗内被扫描 <span className="font-bold text-red-600">{alert.scanCount}</span> 次 · <span className="font-bold text-red-600">{alert.distinctIps}</span> 个不同 IP</p>
                  <div className="mt-2 text-[10px] text-slate-500 flex gap-1 items-start">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {alert.locations.map((l, idx) => <span key={idx} className="bg-slate-100 px-1 rounded font-mono">{l}</span>)}
                    </div>
                  </div>
                  {alert.frozen ? (
                    <button onClick={() => handleUnfreeze(alert.code)} className="mt-2 w-full text-[10px] bg-slate-600 hover:bg-slate-700 text-white py-1 rounded font-medium transition-colors">解冻该溯源码</button>
                  ) : (
                    <button onClick={() => handleFreeze(alert.code)} className="mt-2 w-full text-[10px] bg-red-600 hover:bg-red-700 text-white py-1 rounded font-medium transition-colors">冻结该溯源码</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full md:w-2/3 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" /> 全网一物一码实时扫码日志</h4>
        </div>
        <div className="flex-1 overflow-y-auto pr-2">
          {scansError ? (
            <div className="text-sm text-red-500 p-2">加载扫码日志失败：{scansError}</div>
          ) : scansLoading && !scans ? (
            <div className="text-sm text-slate-400 p-4">加载中…</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3 font-medium">标签流水号</th>
                  <th className="py-2 px-3 font-medium">发生时间</th>
                  <th className="py-2 px-3 font-medium">终端IP</th>
                  <th className="py-2 px-3 font-medium">终端标识</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(scans ?? []).map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-medium">{scan.code}</td>
                    <td className="py-2 px-3">{new Date(scan.scannedAt).toLocaleString()}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{scan.ip}</td>
                    <td className="py-2 px-3 text-slate-400 truncate max-w-[200px]">{scan.userAgent ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
