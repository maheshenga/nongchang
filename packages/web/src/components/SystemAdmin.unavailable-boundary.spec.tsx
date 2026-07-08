import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import SystemAdmin from './SystemAdmin';

const agentMocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  createAgent: vi.fn(),
}));

vi.mock('../api/agents', () => agentMocks);
vi.mock('../hooks/useToast', () => ({ showToast: vi.fn() }));

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'SystemAdmin.tsx');

describe('SystemAdmin unavailable capability boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentMocks.listAgents.mockResolvedValue([
      {
        id: 'agent-1',
        tenantId: 'tenant-1',
        name: 'North Agent',
        region: 'North',
        status: 'active',
        merchantCount: 2,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    agentMocks.createAgent.mockResolvedValue({
      id: 'agent-new',
      tenantId: 'tenant-1',
      name: 'New Agent',
      region: 'East',
      status: 'active',
      merchantCount: 0,
      createdAt: '2026-07-02T00:00:00.000Z',
    });
  });

  test('does not expose unavailable platform capabilities as clickable actions', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('handleSensitiveAction');
    expect(source).not.toContain('confirmAction');
    expect(source).not.toContain('showConfirmModal');
    expect(source).not.toContain('actionPending');

    for (const phrase of [
      '区块链',
      '上链',
      '存证',
      '智能合约',
      '快照',
      '主网',
      '自动放行',
      '无限级',
      '流通全链路',
      '立即触发',
    ]) {
      expect(source).not.toContain(phrase);
    }
  });

  test('renders unavailable services as status surfaces, while preserving real agent management', async () => {
    render(<SystemAdmin />);

    expect(await screen.findByText('North Agent')).toBeTruthy();

    for (const service of [
      '系统级 AI 农业助理',
      'IoT 物联网数据总线',
      '消费者端防伪溯源 H5',
      '跨国节点多语言支持',
    ]) {
      const surface = screen.getByLabelText(`${service} 状态`);
      expect(within(surface).queryByRole('button')).toBeNull();
    }

    expect(screen.queryByRole('dialog', { name: '安全二次确认' })).toBeNull();
    expect(screen.getByText('备份任务接口待接入')).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增代理' })).toBeTruthy();
  });
});
