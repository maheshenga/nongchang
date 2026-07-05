import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'platform-user', tenantId: 'platform-tenant', role: 'platform_admin', agentId: null, ownerId: null },
    profile: { displayName: 'Platform Admin' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock('./components/FarmFields', () => ({ default: () => <div>Farm Fields View</div> }));
vi.mock('./components/TenantManagement', () => ({ default: () => <div>Tenant Management View</div> }));

import App from './App';

beforeEach(() => {
  window.location.hash = '';
});

describe('App platform_admin wiring', () => {
  it('renders the platform tenant management surface for platform admins', async () => {
    render(<App />);

    expect(await screen.findByText('Tenant Management View')).toBeTruthy();
    expect(screen.getAllByText('租户管理').length).toBeGreaterThan(0);
    expect(screen.queryByText('算力与额度')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
  });
});
