import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  listBatches: vi.fn(),
  listFields: vi.fn(),
  listFarmRecords: vi.fn(),
  listMerchants: vi.fn(),
  listPendingUsers: vi.fn(),
  getIntegrationConfig: vi.fn(),
  getBillingSummary: vi.fn(),
  getTenantReadiness: vi.fn(),
}));
const demoModuleMock = vi.hoisted(() => ({ imports: 0 }));

vi.mock('../api/batches', () => ({ listBatches: apiMocks.listBatches }));
vi.mock('../api/fields', () => ({ listFields: apiMocks.listFields }));
vi.mock('../api/farm-records', () => ({ listFarmRecords: apiMocks.listFarmRecords }));
vi.mock('../api/users', () => ({
  listMerchants: apiMocks.listMerchants,
  listPendingUsers: apiMocks.listPendingUsers,
}));
vi.mock('../api/integration', () => ({ getIntegrationConfig: apiMocks.getIntegrationConfig }));
vi.mock('../api/billing', () => ({ getBillingSummary: apiMocks.getBillingSummary }));
vi.mock('../api/readiness', () => ({ getTenantReadiness: apiMocks.getTenantReadiness }));

vi.mock('./DashboardDemo', () => {
  demoModuleMock.imports += 1;
  return {
    default: ({ onExitDemo }: { onExitDemo: () => void }) => (
      <div>
        <div>Lazy Demo Dashboard</div>
        <button type="button" onClick={onExitDemo}>Return from lazy demo</button>
      </div>
    ),
  };
});

vi.mock('react-grid-layout/legacy', () => ({
  Responsive: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  WidthProvider: (Component: React.ComponentType<{ children: React.ReactNode }>) => Component,
}));

vi.mock('recharts', () => {
  const Chart = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  const Leaf = () => null;
  return {
    AreaChart: Chart,
    Area: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    CartesianGrid: Leaf,
    Tooltip: Leaf,
    ResponsiveContainer: Chart,
    PieChart: Chart,
    Pie: Chart,
    Cell: Leaf,
    LineChart: Chart,
    Line: Leaf,
    Legend: Leaf,
    Radar: Leaf,
    RadarChart: Chart,
    PolarGrid: Leaf,
    PolarAngleAxis: Leaf,
    PolarRadiusAxis: Leaf,
    ComposedChart: Chart,
    BarChart: Chart,
    Bar: Leaf,
  };
});

vi.mock('./AntiFakeMonitor', () => ({
  default: () => <div>防伪监控演示占位</div>,
}));

import Dashboard from './Dashboard';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  });
});

beforeEach(() => {
  apiMocks.listBatches.mockReset();
  apiMocks.listFields.mockReset();
  apiMocks.listFarmRecords.mockReset();
  apiMocks.listMerchants.mockReset();
  apiMocks.listPendingUsers.mockReset();
  apiMocks.getIntegrationConfig.mockReset();
  apiMocks.getBillingSummary.mockReset();
  apiMocks.getTenantReadiness.mockReset();
  demoModuleMock.imports = 0;

  apiMocks.listBatches.mockResolvedValue([
    { id: 'b1', batchNo: 'B-001', cropName: '番茄', status: 'growing', scanTotal: 4 },
    { id: 'b2', batchNo: 'B-002', cropName: '黄瓜', status: 'harvested', scanTotal: 3 },
    { id: 'b3', batchNo: 'B-003', cropName: '辣椒', status: 'Planting' },
  ]);
  apiMocks.listFields.mockResolvedValue([{ id: 'f1', name: 'A 区', area: 12 }]);
  apiMocks.listFarmRecords.mockResolvedValue([
    { id: 'r1', action: '施肥', status: 'completed', recordedAt: '2026-07-06T08:00:00.000Z' },
    { id: 'r2', action: '巡田', status: 'pending', recordedAt: '2026-07-07T08:00:00.000Z' },
  ]);
  apiMocks.listMerchants.mockResolvedValue([{ id: 'm1', displayName: '甲商户' }]);
  apiMocks.listPendingUsers.mockResolvedValue([
    { id: 'p1', displayName: '待审一', phone: null, createdAt: '2026-07-07T08:00:00.000Z' },
    { id: 'p2', displayName: '待审二', phone: null, createdAt: '2026-07-07T08:00:00.000Z' },
  ]);
  apiMocks.getIntegrationConfig.mockImplementation(async (provider: string) => (
    provider === 'wechat'
      ? { provider, appId: 'wx-app', secretMasked: '***', apiKeyMasked: null, apiSecretMasked: null, enabled: true }
      : provider === 'tianditu'
        ? { provider, appId: 'map-key', secretMasked: null, apiKeyMasked: null, apiSecretMasked: null, enabled: false }
        : null
  ));
  apiMocks.getBillingSummary.mockResolvedValue({ ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 8, codeBalance: 20 });
  apiMocks.getTenantReadiness.mockResolvedValue({
    ready: false,
    checks: [
      { code: 'legal', label: '法律协议已发布', ready: false, target: 'legalSettings' },
      { code: 'wechat', label: '微信小程序已启用', ready: true, target: 'integrations' },
      { code: 'oss', label: '对象存储已启用', ready: true, target: 'aiOssSettings' },
      { code: 'map', label: '地图服务已启用', ready: true, target: 'integrations' },
      { code: 'ai', label: 'AI 服务商已启用', ready: true, target: 'aiProviders' },
      { code: 'payment', label: '支付宝支付已启用', ready: true, target: 'billing' },
      { code: 'quota', label: '初始业务额度已配置', ready: true, target: 'billing' },
      { code: 'apiDomain', label: '公网 API 域名已配置', ready: true },
      { code: 'supportContact', label: '小程序客服联系方式已配置', ready: true },
      { code: 'salesContact', label: '销售开通联系方式已配置', ready: true },
    ],
  });
});

describe('Dashboard truthfulness boundary', () => {
  it('defaults to a production status surface instead of showing simulated dashboard actions', async () => {
    render(<Dashboard role="merchant_admin" onNavigate={vi.fn()} />);

    expect(screen.getByText('商户生产工作台')).toBeTruthy();
    expect(await screen.findByText(/数据来源：真实业务 API/)).toBeTruthy();
    expect(screen.getByLabelText('在管批次 2')).toBeTruthy();
    expect(screen.getByLabelText('地块数量 1')).toBeTruthy();
    expect(screen.getByLabelText('农事记录 2')).toBeTruthy();
    expect(screen.getByLabelText('累计扫码 7')).toBeTruthy();
    expect(screen.getByText('最近农事记录')).toBeTruthy();
    expect(screen.getByText('巡田')).toBeTruthy();
    expect(screen.getByText('进入演示看板')).toBeTruthy();
    expect(screen.queryByText('智能种植顾问 (AI)')).toBeNull();
    expect(screen.queryByText('年度溯源决策报告 (PDF)')).toBeNull();
    expect(screen.queryByText('自动刷新: 关闭')).toBeNull();
    expect(screen.queryByText('供应链金融数据分析 (信用与回款)')).toBeNull();
  });

  it('lazy-loads the demo dashboard only after explicit opt-in', async () => {
    render(<Dashboard role="merchant_admin" onNavigate={vi.fn()} />);

    expect(await screen.findByText('生产模式')).toBeTruthy();
    expect(demoModuleMock.imports).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '\u8fdb\u5165\u6f14\u793a\u770b\u677f' }));

    expect(await screen.findByText('Lazy Demo Dashboard')).toBeTruthy();
    expect(demoModuleMock.imports).toBe(1);
  });

  it('shows a retryable error when production data fails to load', async () => {
    apiMocks.listBatches.mockRejectedValueOnce(new Error('Batch API down'));

    render(<Dashboard role="merchant_admin" onNavigate={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('生产看板数据加载失败');
    expect(alert.textContent).toContain('Batch API down');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(apiMocks.listBatches).toHaveBeenCalledTimes(2));
  });

  it('requires explicit demo opt-in and can return to the production boundary', async () => {
    render(<Dashboard role="merchant_admin" onNavigate={vi.fn()} />);

    expect(await screen.findByText('生产模式')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '\u8fdb\u5165\u6f14\u793a\u770b\u677f' }));

    expect(await screen.findByText('Lazy Demo Dashboard')).toBeTruthy();
    expect(screen.getByText('Return from lazy demo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Return from lazy demo' }));

    expect(await screen.findByText('生产模式')).toBeTruthy();
    expect(screen.queryByText('Lazy Demo Dashboard')).toBeNull();
  });

  it('navigates from merchant quick actions', async () => {
    const onNavigate = vi.fn();
    render(<Dashboard role="merchant_admin" onNavigate={onNavigate} />);

    fireEvent.click(await screen.findByRole('button', { name: '新建农事记录' }));
    expect(onNavigate).toHaveBeenCalledWith('records');
  });

  it('uses real system-admin data for pending, integration, and credit warnings', async () => {
    render(<Dashboard role="system_admin" onNavigate={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: '上线就绪检查' })).toBeTruthy();
    expect(screen.getByText('1 项待完成')).toBeTruthy();
    expect(await screen.findByLabelText('待处理农事记录 1')).toBeTruthy();
    expect(screen.getByLabelText('待审核入驻 2')).toBeTruthy();
    expect(screen.getByLabelText('集成缺口 2')).toBeTruthy();
    expect(screen.getByLabelText('额度预警 2')).toBeTruthy();
    expect(screen.getByText('AI 8 · 生码 20')).toBeTruthy();
  });

  it('does not mount tenant production APIs for platform or member workspaces', async () => {
    const { unmount } = render(<Dashboard role="platform_admin" onNavigate={vi.fn()} />);
    expect(await screen.findByText('平台租户工作台')).toBeTruthy();
    expect(apiMocks.listBatches).not.toHaveBeenCalled();
    expect(apiMocks.listFields).not.toHaveBeenCalled();
    expect(apiMocks.listFarmRecords).not.toHaveBeenCalled();

    unmount();
    render(<Dashboard role="member" onNavigate={vi.fn()} />);
    expect(await screen.findByText('会员个人工作台')).toBeTruthy();
    expect(apiMocks.listBatches).not.toHaveBeenCalled();
  });
});
