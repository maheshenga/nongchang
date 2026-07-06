import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({ role: 'platform_admin' }));

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'mock-user', tenantId: 'mock-tenant', role: authMock.role, agentId: null, ownerId: null },
    profile: { displayName: 'Mock User' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock('./components/FarmFields', () => ({ default: () => <div>Farm Fields View</div> }));
vi.mock('./components/MerchantManagement', () => ({ default: () => <div>Merchant Management View</div> }));
vi.mock('./components/Settings', () => ({ default: () => <div>Settings View</div> }));
vi.mock('./components/TenantManagement', () => ({ default: () => <div>Tenant Management View</div> }));
vi.mock('./components/BillingAdmin', () => ({ default: () => <div>Billing Admin View</div> }));

import App from './App';

beforeEach(() => {
  window.location.hash = '';
  authMock.role = 'platform_admin';
});

describe('App role wiring', () => {
  it('renders the platform tenant management surface for platform admins', async () => {
    render(<App />);

    expect(await screen.findByText('Tenant Management View')).toBeTruthy();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
  });

  it('renders only the safe settings surface for ordinary members', async () => {
    authMock.role = 'member';

    render(<App />);

    expect(await screen.findByText('Settings View')).toBeTruthy();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
    expect(screen.queryByText('12K')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open billing resources' })).toBeNull();
  });

  it('opens billing resources only for roles with billing access', async () => {
    authMock.role = 'agent_admin';

    render(<App />);

    const billingShortcut = await screen.findByRole('button', { name: 'Open billing resources' });
    fireEvent.click(billingShortcut);

    expect(await screen.findByText('Billing Admin View')).toBeTruthy();
  });

  it('marks notifications as unavailable instead of leaving an inert header action', async () => {
    render(<App />);

    const notificationButton = await screen.findByRole('button', { name: 'Notifications unavailable' });
    expect((notificationButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('falls back to the safe settings surface for unknown token roles', async () => {
    authMock.role = 'future_role';

    render(<App />);

    expect(await screen.findByText('Settings View')).toBeTruthy();
    expect(screen.queryByText('Tenant Management View')).toBeNull();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
  });

  it('removes previously mounted privileged surfaces after switching to member', async () => {
    authMock.role = 'merchant';
    const { rerender } = render(<App />);

    expect(await screen.findByText('Farm Fields View')).toBeTruthy();

    authMock.role = 'member';
    rerender(<App />);

    expect(await screen.findByText('Settings View')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Farm Fields View')).toBeNull());
    expect(screen.queryByText('Merchant Management View')).toBeNull();
  });

  it('renders the Fluent console shell for authenticated users', async () => {
    render(<App />);

    expect(await screen.findByText('农场溯源管理')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索资源、菜单和功能')).toBeTruthy();
    expect(screen.getByRole('button', { name: /退出/ })).toBeTruthy();
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
