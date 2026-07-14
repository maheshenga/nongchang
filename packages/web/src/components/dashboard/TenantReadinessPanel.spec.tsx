import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TenantReadinessView } from '@nongchang/shared';
import TenantReadinessPanel from './TenantReadinessPanel';

const view: TenantReadinessView = {
  ready: false,
  checks: [
    { code: 'legal', label: '法律协议已发布', ready: false, target: 'legalSettings' },
    { code: 'wechat', label: '微信小程序已启用', ready: true, target: 'integrations' },
    { code: 'oss', label: '对象存储已启用', ready: true, target: 'aiOssSettings' },
    { code: 'map', label: '地图服务已启用', ready: true, target: 'integrations' },
    { code: 'ai', label: 'AI 服务商已启用', ready: true, target: 'aiProviders' },
    { code: 'payment', label: '支付宝支付已启用', ready: true, target: 'billing' },
    { code: 'quota', label: '初始业务额度已配置', ready: false, target: 'billing' },
    { code: 'apiDomain', label: '公网 API 域名已配置', ready: true },
    { code: 'supportContact', label: '小程序客服联系方式已配置', ready: true },
    { code: 'salesContact', label: '销售开通联系方式已配置', ready: true },
  ],
};

describe('TenantReadinessPanel', () => {
  it('shows every check and routes failed configurable checks', () => {
    const onNavigate = vi.fn();
    render(<TenantReadinessPanel view={view} loading={false} error={null} onRetry={vi.fn()} onNavigate={onNavigate} />);

    expect(screen.getByRole('heading', { name: '上线就绪检查' })).toBeTruthy();
    expect(screen.getByText('2 项待完成')).toBeTruthy();
    expect(screen.getByText('法律协议已发布')).toBeTruthy();
    expect(screen.getByText('初始业务额度已配置')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '配置 法律协议已发布' }));
    expect(onNavigate).toHaveBeenCalledWith('legalSettings');
  });

  it('renders retryable unknown state instead of guessing readiness', () => {
    const onRetry = vi.fn();
    render(<TenantReadinessPanel view={null} loading={false} error="readiness unavailable" onRetry={onRetry} onNavigate={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('上线就绪状态加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('reports an all-ready launch state', () => {
    render(<TenantReadinessPanel
      view={{ ...view, ready: true, checks: view.checks.map((check) => ({ ...check, ready: true })) }}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      onNavigate={vi.fn()}
    />);

    expect(screen.getByText('已满足上线条件')).toBeTruthy();
  });
});
