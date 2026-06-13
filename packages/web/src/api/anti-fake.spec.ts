import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { listScans, listAlerts, freezeCode, unfreezeCode } from './anti-fake';

beforeEach(() => requestMock.mockReset().mockResolvedValue([]));

describe('anti-fake api client', () => {
  it('listScans 调用 GET /anti-fake/scans?limit=50', async () => {
    await listScans();
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/scans?limit=50');
  });
  it('listAlerts 调用 GET /anti-fake/alerts', async () => {
    await listAlerts();
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/alerts');
  });
  it('freezeCode POST 且对 code 转义', async () => {
    requestMock.mockResolvedValue({ code: 'A B', frozen: true });
    await freezeCode('A B');
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/codes/A%20B/freeze', { method: 'POST' });
  });
  it('unfreezeCode POST', async () => {
    requestMock.mockResolvedValue({ code: 'C1', frozen: false });
    await unfreezeCode('C1');
    expect(requestMock).toHaveBeenCalledWith('/anti-fake/codes/C1/unfreeze', { method: 'POST' });
  });
});
