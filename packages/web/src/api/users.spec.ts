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

  it('user list APIs serialize server-side search', async () => {
    await listUsers({ page: 1, pageSize: 50, search: '张三' });
    await listMerchants({ page: 1, pageSize: 50, search: '合作社' });
    await listPendingUsers({ page: 1, pageSize: 50, search: '待审核' });
    expect(requestMock).toHaveBeenNthCalledWith(1, '/users?page=1&pageSize=50&search=%E5%BC%A0%E4%B8%89');
    expect(requestMock).toHaveBeenNthCalledWith(2, '/users/merchants?page=1&pageSize=50&search=%E5%90%88%E4%BD%9C%E7%A4%BE');
    expect(requestMock).toHaveBeenNthCalledWith(3, '/users/pending?page=1&pageSize=50&search=%E5%BE%85%E5%AE%A1%E6%A0%B8');
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
