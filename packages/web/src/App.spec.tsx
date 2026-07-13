import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  role: 'platform_admin',
  isAuthenticated: true,
  isReady: true,
  profile: { displayName: 'Mock User' } as { displayName: string } | null,
  dashboardError: null as Error | null,
}));

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'mock-user', tenantId: 'mock-tenant', role: authMock.role, agentId: null, ownerId: null },
    profile: authMock.profile,
    isAuthenticated: authMock.isAuthenticated,
    isReady: authMock.isReady,
    logout: vi.fn(),
  }),
}));

vi.mock('./components/FarmFields', () => ({
  default: ({ onOpenAi }: { onOpenAi?: (context: { fieldId: string }) => void }) => (
    <div>
      Farm Fields View
      <button type="button" onClick={() => onOpenAi?.({ fieldId: 'field-1' })}>Field AI shortcut</button>
    </div>
  ),
}));
vi.mock('./components/MerchantManagement', () => ({ default: () => <div>Merchant Management View</div> }));
vi.mock('./components/Settings', () => ({ default: () => <div>Settings View</div> }));
vi.mock('./components/MemberCenter', () => ({ default: () => <div>Member Center View</div> }));
vi.mock('./components/PublicLanding', () => ({
  default: ({ onLogin, onTraceLookup }: { onLogin: () => void; onTraceLookup?: (code: string) => void }) => (
    <div>
      <button type="button" onClick={onLogin}>Landing CTA</button>
      <button type="button" onClick={() => onTraceLookup?.('ORC-ABC')}>Landing trace lookup</button>
    </div>
  ),
}));
vi.mock('./components/AppLogin', () => ({ default: () => <div>Login Form View</div> }));
vi.mock('./components/TenantManagement', () => ({ default: () => <div>Tenant Management View</div> }));
vi.mock('./components/BillingAdmin', () => ({ default: () => <div>Billing Admin View</div> }));
vi.mock('./components/AiAssistant', () => ({
  default: ({ role, context }: { role: string; context?: { fieldId?: string } }) => (
    <div>AI Assistant View {role} {context?.fieldId ?? '-'}</div>
  ),
}));
vi.mock('./components/FarmRecords', () => ({ default: () => <div>Farm Records View</div> }));
vi.mock('./components/Dashboard', () => ({
  default: ({ role, onNavigate }: { role: string; onNavigate: (tab: string) => void }) => (
    authMock.dashboardError
      ? (() => { throw authMock.dashboardError; })()
      : (
          <div>
            <div>Production Overview View {role}</div>
            <button type="button" onClick={() => onNavigate('records')}>Dashboard records shortcut</button>
          </div>
        )
  ),
}));
vi.mock('./components/TraceabilityPage', () => ({ default: ({ code }: { code: string }) => <div>Trace View {code}</div> }));

import App from './App';
import { registerUnsavedChangesGuard } from './ui/unsaved-changes';

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  authMock.role = 'platform_admin';
  authMock.isAuthenticated = true;
  authMock.isReady = true;
  authMock.profile = { displayName: 'Mock User' };
  authMock.dashboardError = null;
});

describe('App role wiring', () => {
  it('shows a session bootstrap skeleton before choosing an authenticated or public surface', () => {
    authMock.isReady = false;
    authMock.isAuthenticated = false;

    render(<App />);

    expect(screen.getByRole('status', { name: '正在恢复会话' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Landing CTA' })).toBeNull();
  });

  it('shows public landing before the login form for unauthenticated visitors', async () => {
    authMock.isAuthenticated = false;

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Landing CTA' })).toBeTruthy();
    expect(screen.queryByText('Login Form View')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Landing CTA' }));

    expect(await screen.findByText('Login Form View')).toBeTruthy();
  });

  it('renders the platform tenant management surface for platform admins', async () => {
    render(<App />);

    expect(await screen.findByText('Tenant Management View')).toBeTruthy();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
  });

  it('starts ordinary members on the safe member center and keeps admin surfaces hidden', async () => {
    authMock.role = 'member';

    render(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    expect(screen.queryByText('Settings View')).toBeNull();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
    expect(screen.queryByText('12K')).toBeNull();
    expect(screen.queryByRole('button', { name: '计费中心' })).toBeNull();
  });

  it('starts tenant business roles on the production overview', async () => {
    authMock.role = 'merchant';

    render(<App />);

    expect(await screen.findByText('Production Overview View merchant_admin')).toBeTruthy();
    expect(screen.queryByText('Tenant Management View')).toBeNull();
  });

  it('routes public trace lookup through the encoded hash route', async () => {
    authMock.isAuthenticated = false;
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Landing trace lookup' }));

    expect(window.location.hash).toBe('#/trace/ORC-ABC');
    expect(await screen.findByText('Trace View ORC-ABC')).toBeTruthy();
  });

  it('passes the normalized role and navigation callback into the production dashboard', async () => {
    authMock.role = 'merchant';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Dashboard records shortcut' }));

    expect(await screen.findByText('Farm Records View')).toBeTruthy();
  });

  it('keeps AI field context while navigating into the retained task workspace', async () => {
    authMock.role = 'merchant';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /地块管理/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Field AI shortcut' }));

    expect(await screen.findByText('AI Assistant View merchant_admin field-1')).toBeTruthy();
  });

  it('unmounts active-only heavy pages after leaving them', async () => {
    authMock.role = 'merchant';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /地块管理/ }));
    expect(await screen.findByText('Farm Fields View')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /农事实操/ }));
    expect(await screen.findByText('Farm Records View')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Farm Fields View')).toBeNull());
  });

  it('opens production overview from global search for system admins', async () => {
    authMock.role = 'system_admin';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /地块管理/ }));
    expect(await screen.findByText('Farm Fields View')).toBeTruthy();

    const overviewLabel = '\u751f\u4ea7\u603b\u89c8';
    fireEvent.change(await screen.findByPlaceholderText('\u641c\u7d22\u8d44\u6e90\u3001\u83dc\u5355\u548c\u529f\u80fd'), { target: { value: overviewLabel } });
    fireEvent.click(await screen.findByRole('option', { name: `\u6253\u5f00 ${overviewLabel}` }));

    expect(await screen.findByText('Production Overview View system_admin')).toBeTruthy();
  });

  it('keeps the active tab when the user cancels leaving unsaved changes', async () => {
    authMock.role = 'system_admin';
    const unregister = registerUnsavedChangesGuard(() => true);
    render(<App />);

    expect(await screen.findByText('Production Overview View system_admin')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /地块管理/ }));
    expect(await screen.findByRole('dialog', { name: '放弃未保存更改' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));

    expect(screen.getByText('Production Overview View system_admin')).toBeTruthy();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
    unregister();
  });

  it('does not expose production overview to platform admins or ordinary members', async () => {
    render(<App />);
    expect(screen.queryByText(/Production Overview View/)).toBeNull();
    expect(screen.queryByRole('button', { name: '\u6253\u5f00 \u751f\u4ea7\u603b\u89c8' })).toBeNull();

    cleanup();
    authMock.role = 'member';
    render(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    expect(screen.queryByText(/Production Overview View/)).toBeNull();
    expect(screen.queryByRole('button', { name: '\u6253\u5f00 \u751f\u4ea7\u603b\u89c8' })).toBeNull();
  });

  it('keeps billing reachable through one normal navigation item', async () => {
    authMock.role = 'agent_admin';

    render(<App />);

    const billingItems = await screen.findAllByRole('button', { name: /计费中心/ });
    expect(billingItems).toHaveLength(1);
    fireEvent.click(billingItems[0]);

    expect(await screen.findByText('Billing Admin View')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open billing resources' })).toBeNull();
  });

  it('shows a neutral account label while profile data loads', async () => {
    authMock.profile = null;
    render(<App />);

    expect(await screen.findByText('账户加载中')).toBeTruthy();
    expect(screen.queryByText('mock-user')).toBeNull();
  });

  it('removes unavailable notifications from the primary header actions', async () => {
    render(<App />);

    expect(await screen.findByText('农场溯源管理')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Notifications unavailable' })).toBeNull();
  });

  it('falls back to the safe settings surface for unknown token roles', async () => {
    authMock.role = 'future_role';

    render(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    expect(screen.queryByText('Tenant Management View')).toBeNull();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
  });

  it('removes previously mounted privileged surfaces after switching to member', async () => {
    authMock.role = 'merchant';
    const { rerender } = render(<App />);

    expect(await screen.findByText('Production Overview View merchant_admin')).toBeTruthy();

    authMock.role = 'member';
    rerender(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Production Overview View/)).toBeNull());
    await waitFor(() => expect(screen.queryByText('Farm Fields View')).toBeNull());
    expect(screen.queryByText('Merchant Management View')).toBeNull();
  });

  it('renders the Fluent console shell for authenticated users', async () => {
    render(<App />);

    expect(await screen.findByText('农场溯源管理')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索资源、菜单和功能')).toBeTruthy();
    expect(screen.getByRole('button', { name: /退出/ })).toBeTruthy();
  });

  it('opens navigation targets from global menu search', async () => {
    authMock.role = 'system_admin';
    render(<App />);

    fireEvent.change(await screen.findByPlaceholderText('搜索资源、菜单和功能'), { target: { value: '商户' } });
    fireEvent.click(await screen.findByRole('option', { name: /打开 商户管理与档案/ }));

    expect(await screen.findByText('Merchant Management View')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '商户管理与档案' })).toBeTruthy();
  });

  it('keeps batch navigation reachable from the shell', async () => {
    authMock.role = 'agent_admin';
    render(<App />);

    const batchTab = await screen.findByRole('button', { name: /批次管理/ });
    fireEvent.click(batchTab);
    await waitFor(() => expect(batchTab.getAttribute('aria-pressed')).toBe('true'));
  });

  it('opens mobile navigation from the command bar menu button', async () => {
    authMock.role = 'agent_admin';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '打开导航' }));

    const mobileNav = await screen.findByRole('dialog', { name: '移动导航' });
    expect(mobileNav.textContent).toContain('批次管理');
  });

  it('collapses navigation groups through accessible category controls', async () => {
    authMock.role = 'system_admin';
    render(<App />);

    const category = await screen.findByRole('button', { name: '系统' });
    expect(category.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /AI 助手/ })).toBeTruthy();

    fireEvent.click(category);

    expect(category.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /AI 助手/ })).toBeNull();
  });

  it('restores collapsed groups for the same role after remounting', async () => {
    authMock.role = 'system_admin';
    const first = render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '平台组织管理' }));
    expect(screen.queryByRole('button', { name: /代理商管理/ })).toBeNull();
    first.unmount();

    render(<App />);

    const restored = await screen.findByRole('button', { name: '平台组织管理' });
    expect(restored.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /代理商管理/ })).toBeNull();
  });

  it('restores an authenticated workspace directly from its hash', async () => {
    authMock.role = 'merchant';
    window.location.hash = '#/app/records';

    render(<App />);

    expect(await screen.findByText('Farm Records View')).toBeTruthy();
    expect(window.location.hash).toBe('#/app/records');
  });

  it('updates the authenticated hash for internal workspace navigation', async () => {
    authMock.role = 'merchant';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Dashboard records shortcut' }));

    expect(await screen.findByText('Farm Records View')).toBeTruthy();
    expect(window.location.hash).toBe('#/app/records');
  });

  it('follows browser history events inside the authenticated workspace', async () => {
    authMock.role = 'merchant';
    window.location.hash = '#/app/records';
    render(<App />);
    expect(await screen.findByText('Farm Records View')).toBeTruthy();

    window.history.pushState(null, '', '#/app/overview');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(await screen.findByText('Production Overview View merchant_admin')).toBeTruthy();
  });

  it('replaces an unavailable workspace hash with the role default', async () => {
    authMock.role = 'merchant';
    window.location.hash = '#/app/tenants';

    render(<App />);

    expect(await screen.findByText('Production Overview View merchant_admin')).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/app/overview'));
  });

  it('restores the accepted hash when browser navigation is canceled', async () => {
    authMock.role = 'system_admin';
    window.location.hash = '#/app/overview';
    const unregister = registerUnsavedChangesGuard(() => true);

    try {
      render(<App />);
      expect(await screen.findByText('Production Overview View system_admin')).toBeTruthy();

      window.history.pushState(null, '', '#/app/fields');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(await screen.findByRole('dialog', { name: '放弃未保存更改' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));

      await waitFor(() => expect(window.location.hash).toBe('#/app/overview'));
      expect(screen.getByText('Production Overview View system_admin')).toBeTruthy();
      expect(screen.queryByText('Farm Fields View')).toBeNull();
    } finally {
      unregister();
    }
  });

  it('contains authenticated workspace render failures inside the application boundary', async () => {
    authMock.role = 'merchant';
    authMock.dashboardError = new Error('dashboard render failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<App />);

      expect((await screen.findByRole('alert')).textContent).toContain('当前页面暂时无法显示');
      expect(screen.getByRole('button', { name: '重试当前页面' })).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('stores navigation preferences in the current tenant-user-role scope', async () => {
    authMock.role = 'system_admin';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '系统' }));

    expect(window.localStorage.getItem('nongchang:navigation-open:v1:mock-tenant:mock-user:system_admin')).not.toBeNull();
  });

  it('moves focus into the mobile drawer, closes on Escape, and restores the trigger', async () => {
    authMock.role = 'agent_admin';
    render(<App />);
    const trigger = await screen.findByRole('button', { name: '打开导航' });

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '移动导航' });
    const close = screen.getByRole('button', { name: '关闭导航' });
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '移动导航' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('opens navigation targets from the drawer search on mobile', async () => {
    authMock.role = 'merchant';
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '打开导航' }));
    const dialog = await screen.findByRole('dialog', { name: '移动导航' });
    const search = within(dialog).getByRole('combobox', { name: '全局搜索' });

    fireEvent.change(search, { target: { value: '农事实操' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(await screen.findByText('Farm Records View')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '移动导航' })).toBeNull();
  });
});
