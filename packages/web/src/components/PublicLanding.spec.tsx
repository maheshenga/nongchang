import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicLanding, { resolveSalesContact } from './PublicLanding';

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

  it('separates existing-account login from assisted opening', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByRole('button', { name: '进入控制台' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '申请开通' }).getAttribute('href')).toBe('#opening');
    expect(screen.getByRole('heading', { name: '申请开通前准备' })).toBeTruthy();
    expect(screen.getByText('租户由平台运营人员审核资料后创建，开通前需要人工审核与配置。')).toBeTruthy();
  });

  it('shows required opening materials for operator review', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    for (const text of ['机构编码与主体名称', '管理员姓名与联系方式', '角色范围与商户/代理商关系', '计费、AI、地图或 OSS 集成需求']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('renders configured sales contact without collecting lead data locally', () => {
    render(<PublicLanding onLogin={vi.fn()} salesContact="sales@example.com / 400-000-0000" />);
    expect(screen.getByText('sales@example.com / 400-000-0000')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows a safe operator-contact fallback when sales contact is not configured', () => {
    render(<PublicLanding onLogin={vi.fn()} salesContact={null} />);
    expect(screen.getByText('请联系平台运营人员获取开通方式。')).toBeTruthy();
  });

  it('resolves configured sales contact from public environment safely', () => {
    expect(resolveSalesContact({ VITE_PUBLIC_SALES_CONTACT: ' sales@example.com ' })).toBe('sales@example.com');
    expect(resolveSalesContact({ VITE_PUBLIC_SALES_CONTACT: 'undefined' })).toBeNull();
    expect(resolveSalesContact({})).toBeNull();
  });

  it('keeps capability copy truthful for setup-dependent integrations', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByText('AI、支付、地图、OSS 等集成在租户配置完成后启用。')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/区块链|实时全网|自动保证|永久免费|免费试用|自动开通|在线注册/);
  });
});
