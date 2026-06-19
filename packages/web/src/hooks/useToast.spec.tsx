import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { showToast, ToastBanner } from './useToast';

describe('ToastBanner', () => {
  it('renders and dismisses the current toast', async () => {
    render(<ToastBanner />);

    await act(async () => { showToast('保存成功', { duration: 0 }); });
    expect(screen.getByText('保存成功')).toBeTruthy();

    await act(async () => { screen.getByRole('button').click(); });
    expect(screen.queryByText('保存成功')).toBeNull();
  });

  it('does not keep stale subscriptions after unmount', async () => {
    const first = render(<ToastBanner />);
    first.unmount();

    const second = render(<ToastBanner />);
    await act(async () => { showToast('重新挂载后可见', { duration: 0 }); });

    expect(screen.getAllByText('重新挂载后可见')).toHaveLength(1);
    await act(async () => { screen.getByRole('button').click(); });
    second.unmount();
  });
});
