import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { attemptChunkReload, isSessionExpiredError } from './error-recovery';

interface AppErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onSessionExpired: () => void;
  onReload?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
  retryKey: number;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary caught a render failure', {
      errorName: error.name,
      componentStack: info.componentStack,
    });
    try {
      attemptChunkReload(error, window.sessionStorage, this.reloadApplication);
    } catch {
      // Storage access itself may be denied; the visible manual actions remain available.
    }
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState(state => ({ error: null, retryKey: state.retryKey + 1 }));
    }
  }

  private reloadApplication = () => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }
    window.location.reload();
  };

  private retryCurrentPage = () => {
    this.setState(state => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  render() {
    const { children, onSessionExpired } = this.props;
    const { error, retryKey } = this.state;

    if (!error) {
      return <Fragment key={retryKey}>{children}</Fragment>;
    }

    const sessionExpired = isSessionExpiredError(error);

    return (
      <div role="alert" className="mx-auto mt-12 max-w-xl rounded-[8px] border border-[#E1DFDD] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#242424]">
          {sessionExpired ? '会话已过期' : '当前页面暂时无法显示'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#605E5C]">
          {sessionExpired
            ? '登录状态已失效，请重新登录后继续操作。'
            : '页面加载或渲染时发生异常。你可以重试当前页面，或重新加载整个应用。'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {sessionExpired ? (
            <button type="button" onClick={onSessionExpired} className="rounded-[4px] bg-[#0078D4] px-4 py-2 text-sm font-semibold text-white">
              重新登录
            </button>
          ) : (
            <button type="button" onClick={this.retryCurrentPage} className="rounded-[4px] bg-[#0078D4] px-4 py-2 text-sm font-semibold text-white">
              重试当前页面
            </button>
          )}
          <button type="button" onClick={this.reloadApplication} className="rounded-[4px] border border-[#8A8886] bg-white px-4 py-2 text-sm font-semibold text-[#323130]">
            重新加载应用
          </button>
        </div>
      </div>
    );
  }
}
