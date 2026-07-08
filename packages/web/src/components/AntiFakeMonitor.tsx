import { useCallback, useEffect } from 'react';
import { Activity, AlertOctagon, MapPin, RefreshCw, ShieldAlert } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { showToast } from '../hooks/useToast';
import { freezeCode, listAlerts, listScans, unfreezeCode } from '../api/anti-fake';
import { fluentButton, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

export default function AntiFakeMonitor() {
  const { data: scans, loading: scansLoading, error: scansError, reload: reloadScans } = useApi(listScans);
  const { data: alerts, loading: alertsLoading, error: alertsError, reload: reloadAlerts } = useApi(listAlerts);

  const reloadAll = useCallback(() => {
    void reloadScans();
    void reloadAlerts();
  }, [reloadScans, reloadAlerts]);

  useEffect(() => {
    const timer = setInterval(reloadAll, 10_000);
    return () => clearInterval(timer);
  }, [reloadAll]);

  const handleFreeze = async (code: string) => {
    try {
      await freezeCode(code);
      showToast(`已冻结溯源码 [${code}]，公开溯源将被拦截`);
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '冻结失败');
    }
  };

  const handleUnfreeze = async (code: string) => {
    try {
      await unfreezeCode(code);
      showToast(`已解冻溯源码 [${code}]`);
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '解冻失败');
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      <header className="flex shrink-0 flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#242424]">
            <ShieldAlert className="h-5 w-5 text-[#A4262C]" />
            防伪风险监控
          </h3>
          <p className="mt-1 text-sm text-[#605E5C]">基于当前账号可见范围内的真实扫码日志识别高频复用风险。</p>
        </div>
        <button type="button" onClick={reloadAll} aria-label="刷新监控数据" className={fluentButton('secondary')}>
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-b border-[#E1DFDD] lg:border-b-0 lg:border-r">
          <div className="flex h-11 items-center gap-2 border-b border-[#E1DFDD] bg-white px-4 text-sm font-semibold text-[#242424]">
            <AlertOctagon className="h-4 w-4 text-[#A4262C]" /> 异常扫码预警
          </div>
          <div className="fluent-scrollbar h-full max-h-[420px] overflow-y-auto p-4 lg:max-h-none">
            {alertsLoading && !alerts && <LoadingState label="加载异常扫码预警" />}
            {alertsError && <ErrorState message={alertsError} onRetry={() => void reloadAlerts()} />}
            {!alertsLoading && !alertsError && (alerts ?? []).length === 0 && (
              <EmptyState title="暂无异常扫码预警" description="当前阈值下未发现高频复用风险。" />
            )}
            {!alertsError && (alerts ?? []).length > 0 && (
              <div className="space-y-3">
                {(alerts ?? []).map((alert) => (
                  <article key={alert.code} className="border border-[#E1DFDD] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm font-semibold text-[#A4262C]">{alert.code}</div>
                        <div className="mt-1 text-xs text-[#605E5C]">
                          时间窗内扫描 <span className="font-semibold text-[#A4262C]">{alert.scanCount}</span> 次，
                          <span className="font-semibold text-[#A4262C]">{alert.distinctIps}</span> 个不同 IP
                        </div>
                      </div>
                      <span className={fluentStatusTag(alert.frozen ? 'danger' : 'warning')}>{alert.frozen ? '已冻结' : '待处置'}</span>
                    </div>

                    <div className="mt-3 flex items-start gap-2 text-xs text-[#605E5C]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A4262C]" />
                      <div className="flex flex-wrap gap-1">
                        {alert.locations.map((location, idx) => (
                          <span key={`${location}-${idx}`} className="border border-[#E1DFDD] bg-[#FAFAFA] px-1.5 py-0.5 font-mono">{location}</span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => alert.frozen ? handleUnfreeze(alert.code) : handleFreeze(alert.code)}
                      aria-label={`${alert.frozen ? '解冻' : '冻结'} ${alert.code}`}
                      className={`${fluentButton(alert.frozen ? 'secondary' : 'danger')} mt-3 w-full`}
                    >
                      {alert.frozen ? '解冻该溯源码' : '冻结该溯源码'}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0">
          <div className="flex h-11 items-center gap-2 border-b border-[#E1DFDD] bg-white px-4 text-sm font-semibold text-[#242424]">
            <Activity className="h-4 w-4 text-[#0078D4]" /> 可见范围扫码日志
          </div>
          <div className="fluent-scrollbar min-h-0 overflow-auto p-4">
            {scansLoading && !scans && <LoadingState label="加载扫码日志" />}
            {scansError && <ErrorState message={scansError} onRetry={() => void reloadScans()} />}
            {!scansLoading && !scansError && (scans ?? []).length === 0 && (
              <EmptyState title="暂无扫码日志" description="消费者扫码后会显示在这里。" />
            )}
            {!scansError && (scans ?? []).length > 0 && (
              <div className="overflow-x-auto border border-[#E1DFDD]">
                <table className={`${fluentTable.table} min-w-[680px]`}>
                  <thead className={fluentTable.thead}>
                    <tr>
                      <th className={fluentTable.th}>溯源码</th>
                      <th className={fluentTable.th}>发生时间</th>
                      <th className={fluentTable.th}>终端 IP</th>
                      <th className={fluentTable.th}>终端标识</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(scans ?? []).map((scan) => (
                      <tr key={scan.id} className={fluentTable.row}>
                        <td className={`${fluentTable.td} font-mono font-semibold`}>{scan.code}</td>
                        <td className={fluentTable.td}>{new Date(scan.scannedAt).toLocaleString('zh-CN')}</td>
                        <td className={`${fluentTable.td} font-mono text-[#605E5C]`}>{scan.ip}</td>
                        <td className={`${fluentTable.td} max-w-[240px] truncate text-[#605E5C]`}>{scan.userAgent ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}
