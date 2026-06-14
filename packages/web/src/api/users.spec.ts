import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { listMerchants, updateUser, setUserStatus } from './users';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('users api', () => {
  it('listMerchants 打 GET /users/merchants', async () => {
    await listMerchants();
    expect(requestMock).toHaveBeenCalledWith('/users/merchants');
  });

  it('updateUser 打 PATCH /users/:id', async () => {
    await updateUser('m1', { displayName: '新名' });
    expect(requestMock).toHaveBeenCalledWith('/users/m1', {
      method: 'PATCH', body: JSON.stringify({ displayName: '新名' }),
    });
  });

  it('setUserStatus 打 POST /users/:id/status', async () => {
    await setUserStatus('m1', 'suspended');
    expect(requestMock).toHaveBeenCalledWith('/users/m1/status', {
      method: 'POST', body: JSON.stringify({ status: 'suspended' }),
    });
  });
});
