import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MeProfileView } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMeMock = vi.fn();
const updateMeMock = vi.fn();
const changePasswordMock = vi.fn();
const updateProfileMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('../api/auth', () => ({
  getMe: () => getMeMock(),
  updateMe: (...args: unknown[]) => updateMeMock(...args),
  changePassword: (...args: unknown[]) => changePasswordMock(...args),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ updateProfile: updateProfileMock, logout: logoutMock }),
}));

import ProfileSettings from './ProfileSettings';

const profile: MeProfileView = {
  id: 'user-1',
  tenantId: 'tenant-1',
  username: 'merchantA',
  role: 'merchant',
  agentId: null,
  displayName: '大理基地',
  phone: '13800001111',
  status: 'active',
  deletionVerification: 'password',
};

const updatedProfile: MeProfileView = {
  ...profile,
  displayName: '大理基地新版',
  phone: '13900002222',
};

const OLD_STYLE_MARKERS = [
  'bg-emerald',
  'text-emerald',
  'border-emerald',
  'rounded-2xl',
  'rounded-3xl',
  'shadow-xl',
  'shadow-2xl',
  'shadow-sm',
];

beforeEach(() => {
  vi.clearAllMocks();
  getMeMock.mockResolvedValue(profile);
  updateMeMock.mockResolvedValue(updatedProfile);
  changePasswordMock.mockResolvedValue({ ok: true });
  logoutMock.mockResolvedValue(undefined);
});

describe('ProfileSettings Fluent account modal', () => {
  it('renders profile data in a compact Fluent modal surface', async () => {
    const { container } = render(<ProfileSettings onClose={vi.fn()} />);

    const backdrop = await screen.findByRole('dialog', { name: '个人账号设置' });

    expect(within(backdrop).getByRole('button', { name: '个人资料' })).toBeTruthy();
    expect(within(backdrop).getByRole('button', { name: '修改密码' })).toBeTruthy();
    expect(screen.getByText('merchantA')).toBeTruthy();
    expect(screen.getByText('商家')).toBeTruthy();
    expect(container.innerHTML).toContain('border-[#E1DFDD]');
    for (const marker of OLD_STYLE_MARKERS) {
      expect(container.innerHTML).not.toContain(marker);
    }
  });

  it('updates profile through the real API wrapper and auth profile cache', async () => {
    render(<ProfileSettings onClose={vi.fn()} />);

    await screen.findByDisplayValue('大理基地');
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '  大理基地新版  ' } });
    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: ' 13900002222 ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalledWith({ displayName: '大理基地新版', phone: '13900002222' });
    });
    expect(updateProfileMock).toHaveBeenCalledWith(updatedProfile);
    expect(await screen.findByText('资料已更新')).toBeTruthy();
  });

  it('validates password changes before calling the API', async () => {
    render(<ProfileSettings onClose={vi.fn()} />);

    await screen.findByText('merchantA');
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));
    expect(await screen.findByText('新密码至少 6 位')).toBeTruthy();
    expect(changePasswordMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'other-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));
    expect(await screen.findByText('两次新密码不一致')).toBeTruthy();
    expect(changePasswordMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'old-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));
    expect(await screen.findByText('新密码不能与旧密码相同')).toBeTruthy();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('changes password, revokes the web session, and requires a fresh login', async () => {
    render(<ProfileSettings onClose={vi.fn()} />);

    await screen.findByText('merchantA');
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));
    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith({ oldPassword: 'old-pass', newPassword: 'new-pass' });
    });
    await waitFor(() => expect(logoutMock).toHaveBeenCalledOnce());
    expect(screen.getByText('密码已修改')).toBeTruthy();
    expect((screen.getByLabelText('原密码') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('新密码') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('确认新密码') as HTMLInputElement).value).toBe('');
  });
});
