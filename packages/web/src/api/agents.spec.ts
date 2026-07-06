import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { listAgents, listMerchants, updateAgent, setAgentStatus } from './agents';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('agents api', () => {
  it('listAgents 打 GET /agents', async () => {
    await listAgents();
    expect(requestMock).toHaveBeenCalledWith('/agents');
  });

  it('listAgents 带分页参数时拼接 querystring', async () => {
    await listAgents({ page: 2, pageSize: 50 });
    expect(requestMock).toHaveBeenCalledWith('/agents?page=2&pageSize=50');
  });

  it('listMerchants 带分页参数时拼接 querystring', async () => {
    await listMerchants({ page: 3, pageSize: 25 });
    expect(requestMock).toHaveBeenCalledWith('/agents/merchants?page=3&pageSize=25');
  });

  it('updateAgent 打 PATCH /agents/:id', async () => {
    await updateAgent('a1', { region: '华南' });
    expect(requestMock).toHaveBeenCalledWith('/agents/a1', {
      method: 'PATCH', body: JSON.stringify({ region: '华南' }),
    });
  });

  it('setAgentStatus 打 POST /agents/:id/status', async () => {
    await setAgentStatus('a1', 'active');
    expect(requestMock).toHaveBeenCalledWith('/agents/a1/status', {
      method: 'POST', body: JSON.stringify({ status: 'active' }),
    });
  });
});
