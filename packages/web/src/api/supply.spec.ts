import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { listSupplies, createSupply, issueSupply, deleteSupply } from './supply';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('supply api client', () => {
  it('listSupplies GET /supplies', async () => {
    await listSupplies();
    expect(requestMock).toHaveBeenCalledWith('/supplies');
  });
  it('createSupply POST /supplies 带 body', async () => {
    await createSupply({ name: '复合肥', unit: '包', amount: 50 });
    expect(requestMock).toHaveBeenCalledWith('/supplies', {
      method: 'POST', body: JSON.stringify({ name: '复合肥', unit: '包', amount: 50 }),
    });
  });
  it('issueSupply POST /supplies/:id/issue,id 编码', async () => {
    await issueSupply('a b', { batchId: 'B1', amount: 10 });
    expect(requestMock).toHaveBeenCalledWith('/supplies/a%20b/issue', {
      method: 'POST', body: JSON.stringify({ batchId: 'B1', amount: 10 }),
    });
  });
  it('deleteSupply DELETE /supplies/:id,id 编码', async () => {
    await deleteSupply('a b');
    expect(requestMock).toHaveBeenCalledWith('/supplies/a%20b', { method: 'DELETE' });
  });
});
