import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { listUsers, listMerchants, listPendingUsers, updateUser, setUserStatus } from './users';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('users api', () => {
  it('listUsers 带分页参数时拼接 querystring', async () => {
    await listUsers({ page: 2, pageSize: 50 });
    expect(requestMock).toHaveBeenCalledWith('/users?page=2&pageSize=50');
  });

  it('listMerchants 打 GET /users/merchants', async () => {
    await listMerchants();
    expect(requestMock).toHaveBeenCalledWith('/users/merchants');
  });

  it('listMerchants 带分页参数时拼接 querystring', async () => {
    await listMerchants({ page: 3, pageSize: 25 });
    expect(requestMock).toHaveBeenCalledWith('/users/merchants?page=3&pageSize=25');
  });

  it('listPendingUsers 带分页参数时拼接 querystring', async () => {
    await listPendingUsers({ page: 4, pageSize: 10 });
    expect(requestMock).toHaveBeenCalledWith('/users/pending?page=4&pageSize=10');
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
