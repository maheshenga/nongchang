import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const agentApiMocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  createAgent: vi.fn(),
}));

vi.mock('../api/agents', () => ({
  listAgents: agentApiMocks.listAgents,
  createAgent: agentApiMocks.createAgent,
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
  };
});

describe('SystemAdmin truthfulness boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    agentApiMocks.listAgents.mockResolvedValue([]);
    agentApiMocks.createAgent.mockResolvedValue({
      id: 'agent-1',
      name: 'Agent One',
      region: '华东',
      status: 'active',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not generate fake live metrics with Math.random at import or render time', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const { default: SystemAdmin } = await import('./SystemAdmin');

    render(<SystemAdmin />);

    await screen.findByText('运营监控待接入');
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('shows an explicit unavailable boundary instead of fake production operations', async () => {
    const { default: SystemAdmin } = await import('./SystemAdmin');

    render(<SystemAdmin />);
    expect(await screen.findByText('运营监控待接入')).toBeTruthy();
    expect(screen.getByText(/暂无实时运营监控数据/)).toBeTruthy();
    expect(screen.getByText(/请接入真实监控 API/)).toBeTruthy();

    const fakeClaims = [
      'SYSTEM ONLINE',
      'CPU 负载 (%)',
      '区块链节点状态',
      'API 响应延迟',
      '存证数据 (今日)',
      '活跃商户通联',
      '新的权限申请',
      '自动归档',
      '系统传感器警报',
      '冷库B区温度异常',
      '调用频次:',
      '算力消耗:',
      '在线设备:',
      '数据吞吐:',
      '今日扫码:',
      '库存水位健康',
      '已触发自动请购单',
      '链上确认',
      '永久留存',
      '导出 PDF 报告',
    ];

    for (const claim of fakeClaims) {
      expect(screen.queryByText((text) => text.includes(claim))).toBeNull();
    }

    await waitFor(() => expect(agentApiMocks.listAgents).toHaveBeenCalledTimes(1));
  });
});
