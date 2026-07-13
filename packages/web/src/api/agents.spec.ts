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

  it('agent and merchant lists serialize server-side search', async () => {
    await listAgents({ page: 1, pageSize: 50, search: '华东' });
    await listMerchants({ page: 1, pageSize: 50, search: '合作社' });
    expect(requestMock).toHaveBeenNthCalledWith(1, '/agents?page=1&pageSize=50&search=%E5%8D%8E%E4%B8%9C');
    expect(requestMock).toHaveBeenNthCalledWith(2, '/agents/merchants?page=1&pageSize=50&search=%E5%90%88%E4%BD%9C%E7%A4%BE');
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
