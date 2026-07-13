import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppErrorBoundary from './AppErrorBoundary';

class SessionExpiredError extends Error {
  status = 401;
}

function ThrowingChild({ error }: { error: Error | null }) {
  if (error) throw error;
  return <div>Recovered workspace</div>;
}

describe('AppErrorBoundary', () => {
  const consoleError = console.error;

  beforeEach(() => {
    window.sessionStorage.clear();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = consoleError;
  });

  it('retries the current page without forcing a full reload', () => {
    let error: Error | null = new Error('render failed');
    const reload = vi.fn();
    const view = render(
      <AppErrorBoundary resetKey="overview" onSessionExpired={vi.fn()} onReload={reload}>
        <ThrowingChild error={error} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain('当前页面暂时无法显示');
    error = null;
    view.rerender(
      <AppErrorBoundary resetKey="overview" onSessionExpired={vi.fn()} onReload={reload}>
        <ThrowingChild error={error} />
      </AppErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: '重试当前页面' }));

    expect(screen.getByText('Recovered workspace')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('offers a full application reload action', () => {
    const reload = vi.fn();
    render(
      <AppErrorBoundary resetKey="overview" onSessionExpired={vi.fn()} onReload={reload}>
        <ThrowingChild error={new Error('render failed')} />
      </AppErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: '重新加载应用' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('routes session-expired failures back to login', () => {
    const onSessionExpired = vi.fn();
    render(
      <AppErrorBoundary resetKey="overview" onSessionExpired={onSessionExpired} onReload={vi.fn()}>
        <ThrowingChild error={new SessionExpiredError('session expired')} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain('会话已过期');
    fireEvent.click(screen.getByRole('button', { name: '重新登录' }));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('uses the reset key to recover after navigation', () => {
    const view = render(
      <AppErrorBoundary resetKey="overview" onSessionExpired={vi.fn()} onReload={vi.fn()}>
        <ThrowingChild error={new Error('render failed')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    view.rerender(
      <AppErrorBoundary resetKey="records" onSessionExpired={vi.fn()} onReload={vi.fn()}>
        <ThrowingChild error={null} />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Recovered workspace')).toBeTruthy();
  });

  it('attempts automatic chunk recovery once and then exposes manual actions', () => {
    const reload = vi.fn();
    const chunkError = new Error('Failed to fetch dynamically imported module');
    const view = render(
      <AppErrorBoundary resetKey="overview" onSessionExpired={vi.fn()} onReload={reload}>
        <ThrowingChild error={chunkError} />
      </AppErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);

    view.rerender(
      <AppErrorBoundary resetKey="records" onSessionExpired={vi.fn()} onReload={reload}>
        <ThrowingChild error={chunkError} />
      </AppErrorBoundary>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '重新加载应用' })).toBeTruthy();
  });
});
