import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('Dashboard truthfulness boundary', () => {
  it('defaults to a production status surface instead of showing simulated dashboard actions', () => {
    render(<Dashboard />);

    expect(screen.getByText('生产数据看板')).toBeTruthy();
    expect(screen.getByText('真实数据接入状态')).toBeTruthy();
    expect(screen.getByText('进入演示看板')).toBeTruthy();
    expect(screen.queryByText('智能种植顾问 (AI)')).toBeNull();
    expect(screen.queryByText('年度溯源决策报告 (PDF)')).toBeNull();
    expect(screen.queryByText('自动刷新: 关闭')).toBeNull();
    expect(screen.queryByText('供应链金融数据分析 (信用与回款)')).toBeNull();
  });

  it('requires explicit demo opt-in and can return to the production boundary', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: '进入演示看板' }));

    expect(screen.getByText(/演示数据 \/ 待接入/)).toBeTruthy();
    expect(screen.getByText('智能种植顾问 (AI)')).toBeTruthy();
    expect(screen.getByText('年度溯源决策报告 (PDF)')).toBeTruthy();
    expect(screen.getByText('自动刷新: 关闭')).toBeTruthy();
    expect(screen.getByText('供应链金融数据分析 (信用与回款)')).toBeTruthy();
    expect(screen.getByText('返回生产状态')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回生产状态' }));

    expect(screen.getByText('生产数据看板')).toBeTruthy();
    expect(screen.queryByText('智能种植顾问 (AI)')).toBeNull();
    expect(screen.queryByText('年度溯源决策报告 (PDF)')).toBeNull();
    expect(screen.queryByText('自动刷新: 关闭')).toBeNull();
    expect(screen.queryByText('供应链金融数据分析 (信用与回款)')).toBeNull();
  });
});
