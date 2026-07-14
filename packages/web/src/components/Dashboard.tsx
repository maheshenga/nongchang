import { lazy, Suspense, useState, type ReactNode } from 'react';
import { getBillingSummary } from '../api/billing';
import { listBatches } from '../api/batches';
import { listFarmRecords } from '../api/farm-records';
import { listFields } from '../api/fields';
import { getIntegrationConfig } from '../api/integration';
import { getTenantReadiness } from '../api/readiness';
import { listMerchants, listPendingUsers } from '../api/users';
import { useApi } from '../hooks/useApi';
import type { AppTab, SystemRole } from '../navigation';
import { fluentButton } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import DemoBadge from './DemoBadge';
import { dashboardQuickActions, dashboardTitle } from './dashboard/dashboard-workspace';
import TenantReadinessPanel from './dashboard/TenantReadinessPanel';

const demoDashboardEnabledAtBuild = import.meta.env.VITE_ENABLE_DEMO_DASHBOARD === 'true';
const DashboardDemo = demoDashboardEnabledAtBuild
  ? lazy(() => import('./DashboardDemo'))
  : null;

const isDemoDashboardEnabled = () => (
  import.meta.env.VITE_ENABLE_DEMO_DASHBOARD === 'true' && DashboardDemo !== null
);

export interface DashboardProps {
  role: SystemRole;
  onNavigate(tab: AppTab): void;
}

type DashboardFrameProps = DashboardProps & {
  onEnterDemo: () => void;
  children: ReactNode;
};

type MetricProps = {
  label: string;
  value: string | number;
  hint: string;
  onOpen?: () => void;
};

const getWechatIntegration = () => getIntegrationConfig('wechat');
const getXfyunIntegration = () => getIntegrationConfig('xfyun');
const getTiandituIntegration = () => getIntegrationConfig('tianditu');

function activeBatchCount(items: Array<{ status: unknown }>): number {
  return items.filter((batch) => !['harvested', 'completed', 'distributed', 'archived'].includes(
    String(batch.status).toLowerCase(),
  )).length;
}

function DashboardFrame({ role, onNavigate, onEnterDemo, children }: DashboardFrameProps) {
  const actions = dashboardQuickActions(role);
  const demoEnabled = isDemoDashboardEnabled();
  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4 bg-white p-4 md:p-6">
      <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
        <div className="text-xs font-semibold text-[#605E5C]">生产模式</div>
        <h2 className="mt-2 text-2xl font-semibold text-[#242424]">{dashboardTitle(role)}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#605E5C]">
          数据来源：真实业务 API。指标与快捷入口只展示当前角色有权访问的业务范围。
        </p>
      </div>

      {children}

      <section className="border border-[#E1DFDD] bg-white p-4" aria-labelledby="dashboard-actions-title">
        <h3 id="dashboard-actions-title" className="text-sm font-semibold text-[#242424]">快捷操作</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actions.map(action => (
            <button
              key={action.tab}
              type="button"
              aria-label={action.label}
              onClick={() => onNavigate(action.tab)}
              className="border border-[#C8C6C4] bg-white p-4 text-left transition-colors hover:border-[#0078D4] hover:bg-[#EFF6FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D4]/40"
            >
              <span className="block text-sm font-semibold text-[#005A9E]">{action.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#605E5C]">{action.description}</span>
            </button>
          ))}
        </div>
      </section>

      {demoEnabled && (
        <section className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" aria-label="演示功能已启用">
          <div className="flex flex-wrap items-center gap-2">
            <DemoBadge note="演示功能已启用" />
            <span>仅用于售前或内部评审，不代表当前租户生产数据。</span>
          </div>
          <button type="button" onClick={onEnterDemo} className={`${fluentButton('primary')} mt-3`}>进入演示看板</button>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint, onOpen }: MetricProps) {
  const content = (
    <>
      <div className="text-xs font-semibold text-[#605E5C]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#242424]">{value}</div>
      <div className="mt-1 text-xs text-[#605E5C]">{hint}</div>
    </>
  );
  const className = 'border border-[#E1DFDD] bg-white p-4 text-left';
  return onOpen ? (
    <button type="button" aria-label={`${label} ${value}`} onClick={onOpen} className={`${className} hover:border-[#0078D4] hover:bg-[#EFF6FC]`}>
      {content}
    </button>
  ) : (
    <section aria-label="信息指标" className={className}>{content}</section>
  );
}

function MerchantProductionDashboard(props: DashboardFrameProps) {
  const batches = useApi(listBatches, { cacheKey: 'batches' });
  const fields = useApi(listFields, { cacheKey: 'fields' });
  const records = useApi(listFarmRecords, { cacheKey: 'farm-records' });
  const batchItems = batches.data ?? [];
  const fieldItems = fields.data ?? [];
  const recordItems = records.data ?? [];
  const totalScans = batchItems.reduce((sum, batch) => sum + (Number(batch.scanTotal) || 0), 0);
  const latestRecord = [...recordItems].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  )[0];
  const error = batches.error || fields.error || records.error;
  const isLoading = !error && (batches.loading || fields.loading || records.loading);
  const reloadAll = () => void Promise.all([batches.reload(), fields.reload(), records.reload()]);

  return (
    <DashboardFrame {...props}>
      {isLoading && <LoadingState label="加载生产看板数据" />}
      {error && <ErrorState title="生产看板数据加载失败" message={error} onRetry={reloadAll} retryLabel="重试" />}
      {!isLoading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="在管批次" value={activeBatchCount(batchItems)} hint="未完成或未归档批次" onOpen={() => props.onNavigate('batches')} />
            <MetricCard label="地块数量" value={fieldItems.length} hint="来自地块 API" onOpen={() => props.onNavigate('fields')} />
            <MetricCard label="农事记录" value={recordItems.length} hint="含待完成与已归档记录" onOpen={() => props.onNavigate('records')} />
            <MetricCard label="累计扫码" value={totalScans} hint="来自批次扫码累计" onOpen={() => props.onNavigate('batches')} />
          </div>
          <section className="border border-[#E1DFDD] bg-white p-4">
            <h3 className="text-sm font-semibold text-[#242424]">最近农事记录</h3>
            {latestRecord ? (
              <div className="mt-3 grid gap-2 text-sm text-[#605E5C] sm:grid-cols-3">
                <div><div className="text-xs font-semibold text-[#605E5C]">作业类型</div><div className="mt-1 font-semibold text-[#242424]">{latestRecord.action}</div></div>
                <div><div className="text-xs font-semibold text-[#605E5C]">状态</div><div className="mt-1 text-[#242424]">{latestRecord.status}</div></div>
                <div><div className="text-xs font-semibold text-[#605E5C]">记录时间</div><div className="mt-1 text-[#242424]">{new Date(latestRecord.recordedAt).toLocaleString()}</div></div>
              </div>
            ) : <EmptyState title="暂无农事记录" description="创建农事记录后，这里会显示最近一次真实作业。" />}
          </section>
        </>
      )}
    </DashboardFrame>
  );
}

function AgentProductionDashboard(props: DashboardFrameProps) {
  const batches = useApi(listBatches, { cacheKey: 'batches' });
  const merchants = useApi(listMerchants, { cacheKey: 'merchants' });
  const billing = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
  const error = batches.error || merchants.error || billing.error;
  const isLoading = !error && (batches.loading || merchants.loading || billing.loading);
  const reloadAll = () => void Promise.all([batches.reload(), merchants.reload(), billing.reload()]);

  return (
    <DashboardFrame {...props}>
      {isLoading && <LoadingState label="加载代理商运营数据" />}
      {error && <ErrorState title="代理商工作台加载失败" message={error} onRetry={reloadAll} retryLabel="重试" />}
      {!isLoading && !error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="旗下商户" value={(merchants.data ?? []).length} hint="当前代理商可见商户" onOpen={() => props.onNavigate('merchantFiles')} />
          <MetricCard label="辖区在管批次" value={activeBatchCount(batches.data ?? [])} hint="未完成或未归档批次" onOpen={() => props.onNavigate('batches')} />
          <MetricCard label="AI 额度" value={billing.data?.aiBalance ?? 0} hint="当前可用 AI 调用额度" onOpen={() => props.onNavigate('billing')} />
          <MetricCard label="生码额度" value={billing.data?.codeBalance ?? 0} hint="当前可用溯源码额度" onOpen={() => props.onNavigate('billing')} />
        </div>
      )}
    </DashboardFrame>
  );
}

function SystemAdminProductionDashboard(props: DashboardFrameProps) {
  const readiness = useApi(getTenantReadiness, { cacheKey: 'tenant-readiness' });
  const batches = useApi(listBatches, { cacheKey: 'batches' });
  const fields = useApi(listFields, { cacheKey: 'fields' });
  const records = useApi(listFarmRecords, { cacheKey: 'farm-records' });
  const pendingUsers = useApi(listPendingUsers, { cacheKey: 'pending-users' });
  const wechat = useApi(getWechatIntegration, { cacheKey: 'integration-wechat' });
  const xfyun = useApi(getXfyunIntegration, { cacheKey: 'integration-xfyun' });
  const tianditu = useApi(getTiandituIntegration, { cacheKey: 'integration-tianditu' });
  const billing = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
  const sources = [batches, fields, records, pendingUsers, wechat, xfyun, tianditu, billing];
  const error = sources.find(source => source.error)?.error ?? null;
  const isLoading = !error && sources.some(source => source.loading);
  const reloadAll = () => void Promise.all(sources.map(source => source.reload()));
  const pendingRecordCount = (records.data ?? []).filter(record => record.status === 'pending').length;
  const integrationGapCount = [wechat.data, xfyun.data, tianditu.data].filter(config => !config?.enabled).length;
  const creditWarningCount = Number((billing.data?.aiBalance ?? 0) < 100) + Number((billing.data?.codeBalance ?? 0) < 100);

  return (
    <DashboardFrame {...props}>
      <TenantReadinessPanel
        view={readiness.data}
        loading={readiness.loading}
        error={readiness.error}
        onRetry={() => void readiness.reload()}
        onNavigate={props.onNavigate}
      />
      {isLoading && <LoadingState label="加载租户运营数据" />}
      {error && <ErrorState title="租户运营工作台加载失败" message={error} onRetry={reloadAll} retryLabel="重试" />}
      {!isLoading && !error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="待处理农事记录" value={pendingRecordCount} hint={`在管批次 ${activeBatchCount(batches.data ?? [])} · 地块 ${(fields.data ?? []).length}`} onOpen={() => props.onNavigate('records')} />
          <MetricCard label="待审核入驻" value={(pendingUsers.data ?? []).length} hint="来自真实入驻审核列表" onOpen={() => props.onNavigate('pendingUsers')} />
          <MetricCard label="集成缺口" value={integrationGapCount} hint="微信、讯飞与天地图未启用项" onOpen={() => props.onNavigate('integrations')} />
          <MetricCard label="额度预警" value={creditWarningCount} hint={`AI ${billing.data?.aiBalance ?? 0} · 生码 ${billing.data?.codeBalance ?? 0}`} onOpen={() => props.onNavigate('billing')} />
        </div>
      )}
    </DashboardFrame>
  );
}

function StaticRoleDashboard(props: DashboardFrameProps) {
  const description = props.role === 'platform_admin'
    ? '平台管理员从租户生命周期入口进入真实平台数据；不会加载租户生产接口。'
    : '会员工作台只展示个人入口；不会加载租户生产或管理接口。';
  return (
    <DashboardFrame {...props}>
      <section aria-label="信息指标" className="border border-[#E1DFDD] bg-white p-5 text-sm leading-6 text-[#605E5C]">
        {description}
      </section>
    </DashboardFrame>
  );
}

function ProductionDashboardStatus(props: DashboardFrameProps) {
  if (props.role === 'merchant_admin') return <MerchantProductionDashboard {...props} />;
  if (props.role === 'agent_admin') return <AgentProductionDashboard {...props} />;
  if (props.role === 'system_admin') return <SystemAdminProductionDashboard {...props} />;
  return <StaticRoleDashboard {...props} />;
}

export default function Dashboard({ role, onNavigate }: DashboardProps) {
  const [dashboardMode, setDashboardMode] = useState<'production' | 'demo'>('production');
  if (dashboardMode === 'demo' && isDemoDashboardEnabled() && DashboardDemo) {
    return (
      <Suspense fallback={<LoadingState label="正在加载演示看板" />}>
        <DashboardDemo onExitDemo={() => setDashboardMode('production')} />
      </Suspense>
    );
  }

  return (
    <ProductionDashboardStatus role={role} onNavigate={onNavigate} onEnterDemo={() => setDashboardMode('demo')}>
      {null}
    </ProductionDashboardStatus>
  );
}
