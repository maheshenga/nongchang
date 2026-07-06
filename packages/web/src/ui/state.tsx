import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react';
import { fluentButton } from './fluent';

interface BaseStateProps {
  className?: string;
}

export interface LoadingStateProps extends BaseStateProps {
  label?: string;
}

export interface EmptyStateProps extends BaseStateProps {
  title: string;
  description?: string;
}

export interface ErrorStateProps extends BaseStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

const stateBase = 'flex min-h-24 flex-col items-center justify-center gap-2 px-4 py-8 text-center';

export function LoadingState({ label = '加载中...', className = '' }: LoadingStateProps) {
  return (
    <div role="status" aria-label={label} className={`${stateBase} text-[#605E5C] ${className}`}>
      <LoaderCircle className="h-5 w-5 animate-spin text-[#0078D4]" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, className = '' }: EmptyStateProps) {
  return (
    <div role="status" aria-label={title} className={`${stateBase} text-[#605E5C] ${className}`}>
      <Inbox className="h-8 w-8 text-[#8A8886]" />
      <div className="text-sm font-semibold text-[#323130]">{title}</div>
      {description && <p className="max-w-md text-xs leading-5">{description}</p>}
    </div>
  );
}

export function ErrorState({
  title = '加载失败',
  message,
  onRetry,
  retryLabel = '重试',
  className = '',
}: ErrorStateProps) {
  return (
    <div role="alert" className={`border border-[#F1B8BD] bg-[#FDE7E9] px-4 py-3 text-sm text-[#A4262C] ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 break-words">{message}</div>
          </div>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className={`${fluentButton('secondary')} shrink-0`}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
