import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  listBatches: vi.fn(),
  listFields: vi.fn(),
  listFarmRecords: vi.fn(),
}));

vi.mock('../api/batches', () => ({ listBatches: apiMocks.listBatches }));
vi.mock('../api/fields', () => ({ listFields: apiMocks.listFields }));
vi.mock('../api/farm-records', () => ({ listFarmRecords: apiMocks.listFarmRecords }));

import Dashboard from './Dashboard';

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
});

describe('Dashboard truthfulness boundary', () => {
  it('defaults to a production status surface instead of showing simulated dashboard actions', async () => {
    render(<Dashboard />);

    expect(screen.getByText('生产数据看板')).toBeTruthy();
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

  it('shows a retryable error when production data fails to load', async () => {
    apiMocks.listBatches.mockRejectedValueOnce(new Error('Batch API down'));

    render(<Dashboard />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('生产看板数据加载失败');
    expect(alert.textContent).toContain('Batch API down');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(apiMocks.listBatches).toHaveBeenCalledTimes(2));
  });

  it('requires explicit demo opt-in and can return to the production boundary', async () => {
    render(<Dashboard />);

    expect(await screen.findByText(/数据来源：真实业务 API/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '进入演示看板' }));

    expect(screen.getByText(/演示数据 \/ 待接入/)).toBeTruthy();
    expect(screen.getByText('智能种植顾问 (AI)')).toBeTruthy();
    expect(screen.getByText('年度溯源决策报告 (PDF)')).toBeTruthy();
    expect(screen.getByText('自动刷新: 关闭')).toBeTruthy();
    expect(screen.getByText('供应链金融数据分析 (信用与回款)')).toBeTruthy();
    expect(screen.getByText('返回生产状态')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回生产状态' }));

    expect(screen.getByText('生产数据看板')).toBeTruthy();
    expect(await screen.findByText(/数据来源：真实业务 API/)).toBeTruthy();
    expect(screen.queryByText('智能种植顾问 (AI)')).toBeNull();
    expect(screen.queryByText('年度溯源决策报告 (PDF)')).toBeNull();
    expect(screen.queryByText('自动刷新: 关闭')).toBeNull();
    expect(screen.queryByText('供应链金融数据分析 (信用与回款)')).toBeNull();
  });
});
