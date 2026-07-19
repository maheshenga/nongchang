import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { createSupply, deleteSupply, issueSupply, listSupplies } from './supply';

const supply = {
  id: 's1', name: 'fertilizer', unit: 'kg', total: 50, used: 0,
  remaining: 50, alert: false, createdAt: '2026-07-13T00:00:00.000Z',
};

beforeEach(() => requestMock.mockReset());

describe('supply api client', () => {
  it('lists supplies', async () => {
    requestMock.mockResolvedValueOnce([supply]);
    await listSupplies();
    expect(requestMock).toHaveBeenCalledWith('/supplies');
  });

  it('creates a supply', async () => {
    requestMock.mockResolvedValueOnce(supply);
    const input = { name: 'fertilizer', unit: 'kg', amount: 50 };
    await createSupply(input);
    expect(requestMock).toHaveBeenCalledWith('/supplies', {
      method: 'POST', body: JSON.stringify(input),
    });
  });

  it('issues supply and encodes the id', async () => {
    requestMock.mockResolvedValueOnce({ supplyId: 'a b', used: 10, remaining: 40 });
    await issueSupply('a b', { batchId: 'B1', amount: 10 });
    expect(requestMock).toHaveBeenCalledWith('/supplies/a%20b/issue', {
      method: 'POST', body: JSON.stringify({ batchId: 'B1', amount: 10 }),
    });
  });

  it('deletes supply and encodes the id', async () => {
    requestMock.mockResolvedValueOnce({ id: 'a b' });
    await deleteSupply('a b');
    expect(requestMock).toHaveBeenCalledWith('/supplies/a%20b', { method: 'DELETE' });
  });
});
