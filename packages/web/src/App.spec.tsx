import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({ role: 'platform_admin', isAuthenticated: true }));

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'mock-user', tenantId: 'mock-tenant', role: authMock.role, agentId: null, ownerId: null },
    profile: { displayName: 'Mock User' },
    isAuthenticated: authMock.isAuthenticated,
    logout: vi.fn(),
  }),
}));

vi.mock('./components/FarmFields', () => ({ default: () => <div>Farm Fields View</div> }));
vi.mock('./components/MerchantManagement', () => ({ default: () => <div>Merchant Management View</div> }));
vi.mock('./components/Settings', () => ({ default: () => <div>Settings View</div> }));
vi.mock('./components/MemberCenter', () => ({ default: () => <div>Member Center View</div> }));
vi.mock('./components/PublicLanding', () => ({ default: ({ onLogin }: { onLogin: () => void }) => <button type="button" onClick={onLogin}>Landing CTA</button> }));
vi.mock('./components/AppLogin', () => ({ default: () => <div>Login Form View</div> }));
vi.mock('./components/TenantManagement', () => ({ default: () => <div>Tenant Management View</div> }));
vi.mock('./components/BillingAdmin', () => ({ default: () => <div>Billing Admin View</div> }));
vi.mock('./components/Dashboard', () => ({ default: () => <div>Production Overview View</div> }));

import App from './App';

beforeEach(() => {
  window.location.hash = '';
  authMock.role = 'platform_admin';
  authMock.isAuthenticated = true;
});

describe('App role wiring', () => {
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

    expect(await screen.findByText('Production Overview View')).toBeTruthy();
    expect(screen.queryByText('Tenant Management View')).toBeNull();
  });

  it('opens production overview from global search for system admins', async () => {
    authMock.role = 'system_admin';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /地块管理/ }));
    expect(await screen.findByText('Farm Fields View')).toBeTruthy();

    const overviewLabel = '\u751f\u4ea7\u603b\u89c8';
    fireEvent.change(await screen.findByPlaceholderText('\u641c\u7d22\u8d44\u6e90\u3001\u83dc\u5355\u548c\u529f\u80fd'), { target: { value: overviewLabel } });
    fireEvent.click(await screen.findByRole('button', { name: `\u6253\u5f00 ${overviewLabel}` }));

    expect(await screen.findByText('Production Overview View')).toBeTruthy();
  });

  it('does not expose production overview to platform admins or ordinary members', async () => {
    render(<App />);
    expect(screen.queryByText('Production Overview View')).toBeNull();
    expect(screen.queryByRole('button', { name: '\u6253\u5f00 \u751f\u4ea7\u603b\u89c8' })).toBeNull();

    cleanup();
    authMock.role = 'member';
    render(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    expect(screen.queryByText('Production Overview View')).toBeNull();
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

    expect(await screen.findByText('Production Overview View')).toBeTruthy();

    authMock.role = 'member';
    rerender(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Production Overview View')).toBeNull());
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
    expect(batchTab.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens mobile navigation from the command bar menu button', async () => {
    authMock.role = 'agent_admin';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open navigation' }));

    const mobileNav = await screen.findByRole('dialog', { name: 'Mobile navigation' });
    expect(mobileNav.textContent).toContain('批次管理');
  });
});
