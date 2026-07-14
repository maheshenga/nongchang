import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { TenantReadinessView } from '@nongchang/shared';
import type { AppTab } from '../../navigation';
import { fluentButton, fluentStatusTag } from '../../ui/fluent';
import { ErrorState, LoadingState } from '../../ui/state';

export interface TenantReadinessPanelProps {
  view: TenantReadinessView | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate: (target: AppTab) => void;
}

export default function TenantReadinessPanel({
  view,
  loading,
  error,
  onRetry,
  onNavigate,
}: TenantReadinessPanelProps) {
  if (loading) {
    return (
      <section className="border border-[#E1DFDD] bg-white" aria-labelledby="tenant-readiness-title">
        <h3 id="tenant-readiness-title" className="sr-only">上线就绪检查</h3>
        <LoadingState label="加载上线就绪检查" />
      </section>
    );
  }
  if (error || !view) {
    return (
      <ErrorState
        title="上线就绪状态加载失败"
        message={error ?? '暂时无法确认上线条件，请重试'}
        onRetry={onRetry}
      />
    );
  }

  const missingCount = view.checks.filter((check) => !check.ready).length;
  return (
    <section className="border border-[#E1DFDD] bg-white p-4" aria-labelledby="tenant-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="tenant-readiness-title" className="text-sm font-semibold text-[#242424]">上线就绪检查</h3>
          <p className="mt-1 text-xs leading-5 text-[#605E5C]">仅展示配置状态，不回显域名、联系方式或密钥内容。</p>
        </div>
        <span className={fluentStatusTag(view.ready ? 'success' : 'warning')}>
          {view.ready ? '已满足上线条件' : `${missingCount} 项待完成`}
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {view.checks.map((check) => (
          <div key={check.code} className="flex min-h-11 items-center gap-2 border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2">
            {check.ready
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#107C10]" />
              : <CircleAlert className="h-4 w-4 shrink-0 text-[#8A6A00]" />}
            <span className="min-w-0 flex-1 text-sm font-semibold text-[#323130]">{check.label}</span>
            {!check.ready && check.target ? (
              <button
                type="button"
                aria-label={`配置 ${check.label}`}
                className={fluentButton('subtle')}
                onClick={() => onNavigate(check.target as AppTab)}
              >
                去配置
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
