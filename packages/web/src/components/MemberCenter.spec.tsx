import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  user: { userId: 'member-1', tenantId: 'tenant-1', role: 'member', agentId: null, ownerId: null },
  profile: { displayName: '普通会员' },
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    profile: authMock.profile,
  }),
}));

import MemberCenter from './MemberCenter';

describe('MemberCenter', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders a real trace query workflow for ordinary members', () => {
    render(<MemberCenter />);

    expect(screen.getByRole('heading', { name: '会员中心' })).toBeTruthy();
    expect(screen.getByText('普通会员')).toBeTruthy();
    expect(screen.getByLabelText('溯源码')).toBeTruthy();
    expect(screen.getByText('查询后会打开真实公开溯源记录，不生成演示数据。')).toBeTruthy();
  });

  it('opens the existing public trace route with a trimmed encoded code', () => {
    render(<MemberCenter />);

    fireEvent.change(screen.getByLabelText('溯源码'), { target: { value: '  ORC 8901/测试  ' } });
    fireEvent.click(screen.getByRole('button', { name: '查询溯源' }));

    expect(window.location.hash).toBe('#/trace/ORC%208901%2F%E6%B5%8B%E8%AF%95');
  });

  it('keeps the member on the page when the trace code is empty', () => {
    render(<MemberCenter />);

    fireEvent.click(screen.getByRole('button', { name: '查询溯源' }));

    expect(window.location.hash).toBe('');
    expect(screen.getByText('请输入溯源码')).toBeTruthy();
  });
});
