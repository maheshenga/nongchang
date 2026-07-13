import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({ role: 'platform_admin', isAuthenticated: true, isReady: true }));

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'mock-user', tenantId: 'mock-tenant', role: authMock.role, agentId: null, ownerId: null },
    profile: { displayName: 'Mock User' },
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
    <div>
      <div>Production Overview View {role}</div>
      <button type="button" onClick={() => onNavigate('records')}>Dashboard records shortcut</button>
    </div>
  ),
}));
vi.mock('./components/TraceabilityPage', () => ({ default: ({ code }: { code: string }) => <div>Trace View {code}</div> }));

import App from './App';
import { registerUnsavedChangesGuard } from './ui/unsaved-changes';

beforeEach(() => {
  window.location.hash = '';
  authMock.role = 'platform_admin';
  authMock.isAuthenticated = true;
  authMock.isReady = true;
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
    expect(screen.queryByRole('button', { name: 'Open billing resources' })).toBeNull();
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

  it('opens production overview from global search for system admins', async () => {
    authMock.role = 'system_admin';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /地块管理/ }));
    expect(await screen.findByText('Farm Fields View')).toBeTruthy();

    const overviewLabel = '\u751f\u4ea7\u603b\u89c8';
    fireEvent.change(await screen.findByPlaceholderText('\u641c\u7d22\u8d44\u6e90\u3001\u83dc\u5355\u548c\u529f\u80fd'), { target: { value: overviewLabel } });
    fireEvent.click(await screen.findByRole('button', { name: `\u6253\u5f00 ${overviewLabel}` }));

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

  it('opens billing resources only for roles with billing access', async () => {
    authMock.role = 'agent_admin';

    render(<App />);

    const billingShortcut = await screen.findByRole('button', { name: 'Open billing resources' });
    fireEvent.click(billingShortcut);

    expect(await screen.findByText('Billing Admin View')).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('button', { name: /打开 商户管理与档案/ }));

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

    fireEvent.click(await screen.findByRole('button', { name: 'Open navigation' }));

    const mobileNav = await screen.findByRole('dialog', { name: 'Mobile navigation' });
    expect(mobileNav.textContent).toContain('批次管理');
  });
});
