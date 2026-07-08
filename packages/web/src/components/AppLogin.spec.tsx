import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLogin from './AppLogin';

const loginMock = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ login: loginMock }),
}));

describe('AppLogin Fluent login', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('submits the real tenant login payload', async () => {
    loginMock.mockResolvedValue(undefined);
    render(<AppLogin />);

    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'tenant-a' } });
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ tenantCode: 'tenant-a', username: 'admin', password: 'secret' });
    });
  });

  it('shows readable fallback copy when login fails without an Error', async () => {
    loginMock.mockRejectedValue('bad');
    render(<AppLogin />);

    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'tenant-a' } });
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));

    expect(await screen.findByText('登录失败')).toBeTruthy();
  });
  it('offers a return path to the public landing when provided', () => {
    const onBackToLanding = vi.fn();
    render(<AppLogin onBackToLanding={onBackToLanding} />);

    fireEvent.click(screen.getByRole('button', { name: '返回介绍页' }));

    expect(onBackToLanding).toHaveBeenCalledTimes(1);
  });

  it('locks the form and ignores duplicate submits while login is pending', async () => {
    let resolveLogin: (() => void) | undefined;
    loginMock.mockImplementation(() => new Promise<void>((resolve) => { resolveLogin = resolve; }));

    render(<AppLogin />);

    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'tenant-a' } });
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });

    const submit = screen.getByRole('button', { name: '安全登录' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    expect(loginMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: '登录中...' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('机构编码') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('登录账号') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('密码') as HTMLInputElement).disabled).toBe(true);

    resolveLogin?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '安全登录' })).toBeTruthy();
    });
  });
});
