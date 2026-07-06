import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingUserView } from '@nongchang/shared';

const listPendingUsersMock = vi.fn();
const reviewUserMock = vi.fn();

vi.mock('../api/users', () => ({
  listPendingUsers: () => listPendingUsersMock(),
  reviewUser: (...args: unknown[]) => reviewUserMock(...args),
}));

import PendingUsers from './PendingUsers';

const users: PendingUserView[] = [
  { id: 'pending-1', displayName: 'Applicant One', phone: '13800000000', createdAt: '2026-07-05T10:00:00.000Z' },
  { id: 'pending-2', displayName: 'No Phone', phone: '', createdAt: 'invalid-date' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  listPendingUsersMock.mockResolvedValue(users);
  reviewUserMock.mockResolvedValue({ id: 'pending-1', status: 'active' });
});

describe('PendingUsers review workflow', () => {
  it('renders pending users in a dense review table', async () => {
    render(<PendingUsers />);
    await screen.findByText('Applicant One');

    expect(screen.getByRole('heading', { name: '入驻审核' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '姓名 / 名称' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeTruthy();
    expect(screen.getByText('-')).toBeTruthy();
    expect(screen.getByText('invalid-date')).toBeTruthy();
  });

  it('submits approve and reject actions through the real review API', async () => {
    render(<PendingUsers />);
    await screen.findByText('Applicant One');

    fireEvent.click(screen.getByRole('button', { name: '通过 Applicant One' }));
    await waitFor(() => expect(reviewUserMock).toHaveBeenCalledWith('pending-1', { action: 'approve' }));

    fireEvent.click(screen.getByRole('button', { name: '拒绝 Applicant One' }));
    await waitFor(() => expect(reviewUserMock).toHaveBeenCalledWith('pending-1', { action: 'reject' }));
  });

  it('does not call review API when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<PendingUsers />);
    await screen.findByText('Applicant One');

    fireEvent.click(screen.getByRole('button', { name: '通过 Applicant One' }));

    expect(reviewUserMock).not.toHaveBeenCalled();
  });
});
