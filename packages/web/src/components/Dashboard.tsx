import { lazy, Suspense, useState } from 'react';
import { listBatches } from '../api/batches';
import { listFarmRecords } from '../api/farm-records';
import { listFields } from '../api/fields';
import { useApi } from '../hooks/useApi';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

const DashboardDemo = lazy(() => import('./DashboardDemo'));

function ProductionDashboardStatus({ onEnterDemo }: { onEnterDemo: () => void }) {
  const batches = useApi(listBatches);
  const fields = useApi(listFields);
  const records = useApi(listFarmRecords);

  const batchItems = batches.data ?? [];
  const fieldItems = fields.data ?? [];
  const recordItems = records.data ?? [];
  const activeBatchItems = batchItems.filter((batch) => !['harvested', 'completed', 'distributed', 'archived'].includes(String(batch.status).toLowerCase()));
  const totalScans = batchItems.reduce((sum, batch) => sum + (Number(batch.scanTotal) || 0), 0);
  const latestRecord = [...recordItems].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  )[0];
  const error = batches.error || fields.error || records.error;
  const isLoading = !error && (batches.loading || fields.loading || records.loading);
  const reloadAll = () => {
    void Promise.all([batches.reload(), fields.reload(), records.reload()]);
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4 bg-white p-6">
      <div className="rounded-lg border border-[#E1DFDD] bg-[#FAFAFA] p-5">
        <div className="text-xs font-semibold uppercase text-[#605E5C]">Production mode</div>
        <h2 className="mt-2 text-2xl font-semibold text-[#242424]">生产数据看板</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#605E5C]">
          数据来源：真实业务 API。系统不会把模拟 AI 预测、模拟自动刷新或硬编码经营指标展示为真实运营数据。
        </p>
      </div>

      {isLoading && <LoadingState label="加载生产看板数据" />}

      {error && (
        <ErrorState title="生产看板数据加载失败" message={error} onRetry={reloadAll} retryLabel="重试" />
      )}

      {!isLoading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: '在管批次', value: activeBatchItems.length, hint: '未完成/未归档批次' },
              { label: '地块数量', value: fieldItems.length, hint: '来自地块 API' },
              { label: '农事记录', value: recordItems.length, hint: '来自农事 API' },
              { label: '累计扫码', value: totalScans, hint: '来自批次扫码累计' },
            ].map((item) => (
              <section
                key={item.label}
                aria-label={`${item.label} ${item.value}`}
                className="rounded-lg border border-[#E1DFDD] bg-white p-4"
              >
                <div className="text-xs font-semibold text-[#605E5C]">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-[#242424]">{item.value}</div>
                <div className="mt-1 text-xs text-[#605E5C]">{item.hint}</div>
              </section>
            ))}
          </div>

          <section className="rounded-lg border border-[#E1DFDD] bg-white p-4">
            <h3 className="text-sm font-semibold text-[#242424]">最近农事记录</h3>
            {latestRecord ? (
              <div className="mt-3 grid gap-2 text-sm text-[#605E5C] sm:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold text-[#8A8886]">作业类型</div>
                  <div className="mt-1 font-semibold text-[#242424]">{latestRecord.action}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#8A8886]">状态</div>
                  <div className="mt-1 text-[#242424]">{latestRecord.status}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#8A8886]">记录时间</div>
                  <div className="mt-1 text-[#242424]">{new Date(latestRecord.recordedAt).toLocaleString()}</div>
                </div>
              </div>
            ) : (
              <EmptyState title="暂无农事记录" description="创建农事记录后，这里会显示最近一次真实作业。" />
            )}
          </section>
        </>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        演示看板仍可用于售前或内部评审，但必须带有演示标识，避免和生产数据混淆。
      </div>

      <div>
        <button
          type="button"
          onClick={onEnterDemo}
          className="inline-flex h-9 items-center rounded-[4px] bg-[#0078D4] px-4 text-sm font-semibold text-white hover:bg-[#106EBE]"
        >
          进入演示看板
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [dashboardMode, setDashboardMode] = useState<'production' | 'demo'>('production');
  return dashboardMode === 'production' ? (
    <ProductionDashboardStatus onEnterDemo={() => setDashboardMode('demo')} />
  ) : (
    <Suspense fallback={<LoadingState label="Loading demo dashboard" />}>
      <DashboardDemo onExitDemo={() => setDashboardMode('production')} />
    </Suspense>
  );
}