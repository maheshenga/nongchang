import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicLanding from './PublicLanding';

describe('PublicLanding', () => {
  it('explains the SaaS value before login and exposes pricing direction', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '农业溯源 SaaS 平台' })).toBeTruthy();
    expect(screen.getByText('把租户、代理商、商户、批次、农事记录和公开溯源查询放进一个可审计的控制台。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '按角色开通' })).toBeTruthy();
    expect(screen.getByText('适合平台运营、代理商管理和商户生产协作，额度和支付能力按租户配置启用。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '进入控制台' })).toBeTruthy();
  });

  it('routes qualified users into the existing login flow', () => {
    const onLogin = vi.fn();
    render(<PublicLanding onLogin={onLogin} />);

    fireEvent.click(screen.getByRole('button', { name: '进入控制台' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('keeps capability copy truthful for setup-dependent integrations', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByText('AI、支付、地图、OSS 等集成在租户配置完成后启用。')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/区块链|实时全网|自动保证|永久免费/);
  });
});
