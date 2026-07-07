import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingUserView } from '@nongchang/shared';

const listPendingUsersMock = vi.fn();
const reviewUserMock = vi.fn();

vi.mock('../api/users', () => ({
  listPendingUsers: () => listPendingUsersMock(),
  reviewUser: (...args: unknown[]) => reviewUserMock(...args),
}));

import PendingUsers from './PendingUsers';
import { DialogHost } from '../hooks/useDialog';

const renderWithDialog = () => render(<><PendingUsers /><DialogHost /></>);

const users: PendingUserView[] = [
  { id: 'pending-1', displayName: 'Applicant One', phone: '13800000000', createdAt: '2026-07-05T10:00:00.000Z' },
  { id: 'pending-2', displayName: 'No Phone', phone: '', createdAt: 'invalid-date' },
];

beforeEach(() => {
  vi.clearAllMocks();
  listPendingUsersMock.mockResolvedValue(users);
  reviewUserMock.mockResolvedValue({ id: 'pending-1', status: 'active' });
});

describe('PendingUsers review workflow', () => {
  it('renders pending users in a dense review table', async () => {
    renderWithDialog();
    await screen.findByText('Applicant One');

    expect(screen.getByRole('heading', { name: '入驻审核' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '姓名 / 名称' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeTruthy();
    expect(screen.getByText('-')).toBeTruthy();
    expect(screen.getByText('invalid-date')).toBeTruthy();
  });

  it('submits approve and reject actions through the real review API', async () => {
    renderWithDialog();
    await screen.findByText('Applicant One');

    fireEvent.click(screen.getByRole('button', { name: '通过 Applicant One' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '通过入驻申请' })).getByRole('button', { name: '通过' }));
    await waitFor(() => expect(reviewUserMock).toHaveBeenCalledWith('pending-1', { action: 'approve' }));

    fireEvent.click(screen.getByRole('button', { name: '拒绝 Applicant One' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '拒绝入驻申请' })).getByRole('button', { name: '拒绝' }));
    await waitFor(() => expect(reviewUserMock).toHaveBeenCalledWith('pending-1', { action: 'reject' }));
  });

  it('does not call review API when confirmation is cancelled', async () => {
    renderWithDialog();
    await screen.findByText('Applicant One');

    fireEvent.click(screen.getByRole('button', { name: '通过 Applicant One' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '通过入驻申请' })).getByRole('button', { name: '取消' }));

    expect(reviewUserMock).not.toHaveBeenCalled();
  });
});
