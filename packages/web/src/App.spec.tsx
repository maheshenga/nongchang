import { render, screen, waitFor } from '@testing-library/react';
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
});
