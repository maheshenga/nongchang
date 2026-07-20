import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';
import { ToastBanner } from '../hooks/useToast';

const authMock = vi.hoisted(() => ({ role: 'system_admin' as string }));
const saveTenantSettingsMock = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'u1', tenantId: 'tenant-1', role: authMock.role, agentId: null, ownerId: null },
  }),
}));

vi.mock('../branding/branding-context', () => ({
  useBranding: () => ({
    publicCoordinateMode: 'hidden',
    brandName: '农场溯源管理',
    industryName: '农业',
    defaultCropName: '作物',
    workbenchTitle: '农业工作台',
    defaultBaseLabel: '当前基地',
    supportContact: null,
    save: (...args: unknown[]) => saveTenantSettingsMock(...args),
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const renderSettings = () => render(<><Settings /><ToastBanner /></>);

describe('Settings production wording', () => {
  beforeEach(() => {
    localStorage.clear();
    authMock.role = 'system_admin';
    saveTenantSettingsMock.mockReset();
  });

  it('does not claim unimplemented system capabilities', () => {
    renderSettings();

    expect(screen.queryByText(/IoT/i)).toBeNull();
    expect(screen.queryByText(/区块链/)).toBeNull();
    expect(screen.queryByText(/智能合约/)).toBeNull();
    expect(screen.queryByText(/推送/)).toBeNull();
    expect(screen.queryByText(/通知订阅/)).toBeNull();
    expect(screen.queryByText(/系统参数/)).toBeNull();
  });

  it('saves only local display preferences', () => {
    renderSettings();

    fireEvent.click(screen.getByLabelText('紧凑表格'));
    fireEvent.click(screen.getByRole('button', { name: /保存本地偏好/ }));

    expect(localStorage.getItem('agri_display_preferences')).toContain('"compactTables":true');
    expect(screen.getByText('本地偏好已保存')).toBeTruthy();
  });

  it('shows the system admin tenant settings form', () => {
    renderSettings();

    expect(screen.getByRole('heading', { name: '租户展示与公开策略' })).toBeTruthy();
    expect(screen.getByLabelText('品牌名称')).toBeTruthy();
    expect(screen.getByLabelText('公开坐标模式')).toBeTruthy();
  });

  it('edits and saves the tenant support contact', async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText('客服联系方式'), {
      target: { value: ' support@example.com ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存租户配置' }));

    await waitFor(() => expect(saveTenantSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ supportContact: 'support@example.com' }),
    ));
  });

  it('saves trimmed tenant branding through the shared context', async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText('默认作物名称'), { target: { value: ' 葡萄 ' } });
    fireEvent.change(screen.getByLabelText('公开坐标模式'), { target: { value: 'exact' } });
    fireEvent.click(screen.getByRole('button', { name: '保存租户配置' }));

    await waitFor(() => {
      expect(saveTenantSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        defaultCropName: ' 葡萄 ',
        publicCoordinateMode: 'exact',
      }));
    });
  });

  it('preserves typed branding inputs when save fails', async () => {
    saveTenantSettingsMock.mockRejectedValueOnce(new Error('offline'));
    renderSettings();

    fireEvent.change(screen.getByLabelText('工作台标题'), { target: { value: ' 云岭工作台 ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存租户配置' }));

    await waitFor(() => expect(screen.getByText('offline')).toBeTruthy());
    expect((screen.getByLabelText('工作台标题') as HTMLInputElement).value).toBe(' 云岭工作台 ');
  });

  it('keeps the fluent settings surface instead of the old emerald card style', () => {
    const { container } = renderSettings();

    expect(screen.getByRole('heading', { name: '本地偏好' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /保存本地偏好/ })).toBeTruthy();
    expect(container.innerHTML).toContain('border-[#E1DFDD]');
  });

  it('hides the tenant configuration form for non-system admins', () => {
    authMock.role = 'member';
    renderSettings();

    expect(screen.queryByRole('heading', { name: '租户展示与公开策略' })).toBeNull();
  });
});
