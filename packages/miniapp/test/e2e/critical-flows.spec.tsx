import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '../../src/pages/login';
import Batch from '../../src/pages/batch';
import Me from '../../src/pages/me';
import AccountData from '../../src/pages/account-data';
import PasswordChange from '../../src/pages/password-change';
import ProfileEdit from '../../src/pages/profile-edit';
import Register from '../../src/pages/register';
import Trace from '../../src/pages/trace';
import Usage from '../../src/pages/usage';
import Work from '../../src/pages/work';
import {
  getWechatRegistrationStatus,
  getMe,
  changePassword,
  login,
  loginWechat,
  registerWechat,
  updateMe,
} from '../../src/api/auth';
import { exportMyData, getMyData, shareMyData } from '../../src/api/account';
import { listBatches, listFarmRecords, listFields } from '../../src/api/farm';
import { getBillingSummary, listLedger } from '../../src/api/billing';
import { request } from '../../src/api/request';
import { listQuickTemplates } from '../../src/api/quickTemplate';
import { listTraceEvents } from '../../src/api/trace';
import { getPublicLegal } from '../../src/api/legal';
import {
  __setRouterParams,
  getStorageSync,
  navigateBack,
  navigateTo,
  setStorageSync,
  switchTab,
} from '@tarojs/taro';

const { openForBatch } = vi.hoisted(() => ({
  openForBatch: vi.fn(),
}));

vi.mock('../../src/config/env', () => ({
  SUPPORT_CONTACT: '',
  WX_APPID: 'wx-test-app-id',
}));

vi.mock('../../src/api/auth', () => ({
  login: vi.fn(),
  loginWechat: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
  registerWechat: vi.fn(),
  getWechatRegistrationStatus: vi.fn(),
}));

vi.mock('../../src/api/farm', () => ({
  listBatches: vi.fn(),
  listFarmRecords: vi.fn(),
  listFields: vi.fn(),
  listSupplies: vi.fn(),
  createFarmRecord: vi.fn(),
  uploadImage: vi.fn(),
  findBatchByCode: vi.fn(),
}));

vi.mock('../../src/api/billing', () => ({
  getBillingSummary: vi.fn(),
  listLedger: vi.fn(),
}));

vi.mock('../../src/api/request', () => ({
  request: vi.fn(),
}));

vi.mock('../../src/api/quickTemplate', () => ({
  listQuickTemplates: vi.fn(),
}));

vi.mock('../../src/api/trace', () => ({
  listTraceEvents: vi.fn(),
}));

vi.mock('../../src/api/account', () => ({
  getMyData: vi.fn(),
  exportMyData: vi.fn(),
  shareMyData: vi.fn(),
}));

vi.mock('../../src/api/legal', () => ({
  getPublicLegal: vi.fn(),
}));

const legalPublication = {
  configured: true as const,
  tenantId: '11111111-1111-4111-8111-111111111111',
  publicationId: '22222222-2222-4222-8222-222222222222',
  operatorName: '示例农业科技有限公司',
  contactAddress: '杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-v1',
  agreementVersion: 'agreement-v1',
  effectiveDate: '2026-07-14',
  privacyPolicyText: '隐私政策正文'.repeat(80),
  userAgreementText: '用户协议正文'.repeat(80),
  publishedAt: '2026-07-14T09:00:00.000Z',
};

vi.mock('../../src/components/RecordForm', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef(function RecordFormMock(_props, ref) {
      React.useImperativeHandle(ref, () => ({
        applyTemplate: vi.fn(),
        openManual: vi.fn(),
        openLocation: vi.fn(),
        openForBatch,
      }));
      return <div data-testid="record-form" />;
    }),
  };
});

describe('miniapp critical rendered flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBatches).mockResolvedValue([]);
    vi.mocked(listFarmRecords).mockResolvedValue([]);
    vi.mocked(listFields).mockResolvedValue([]);
    vi.mocked(getBillingSummary).mockResolvedValue({
      ownerType: 'MERCHANT',
      ownerId: 'merchant-1',
      aiBalance: 10,
      codeBalance: 20,
    });
    vi.mocked(request).mockResolvedValue({ items: [] });
    vi.mocked(listQuickTemplates).mockResolvedValue([]);
    vi.mocked(getPublicLegal).mockResolvedValue(legalPublication);
  });

  it('requires authorization for both login methods and locks WeChat while password login is pending', async () => {
    render(<Login />);

    expect(screen.getByRole('button', { name: /申请入驻/ })).toBeTruthy();
    const initialConsent = await screen.findByRole('checkbox');
    expect((screen.getByRole('button', { name: '安全登录' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole('button', { name: '微信一键登录' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(login).not.toHaveBeenCalled();
    expect(loginWechat).not.toHaveBeenCalled();
    expect(initialConsent).toBeTruthy();

    const tenantInput = screen.getByPlaceholderText('请输入机构编码');
    fireEvent.change(tenantInput, { target: { value: ' acme ' } });
    fireEvent.blur(tenantInput);
    fireEvent.change(screen.getByPlaceholderText('手机号 / 用户名'), { target: { value: ' admin ' } });
    fireEvent.change(screen.getByPlaceholderText('请输入服务密码'), { target: { value: ' secret ' } });
    fireEvent.click(await screen.findByRole('checkbox'));

    let resolveLogin!: () => void;
    vi.mocked(login).mockImplementation(() => new Promise<void>((resolve) => {
      resolveLogin = resolve;
    }));

    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        'ACME', 'admin', 'secret', legalPublication.publicationId,
      );
      expect((screen.getByRole('button', { name: '微信一键登录' }) as HTMLButtonElement).disabled).toBe(true);
    });

    resolveLogin();
  });

  it('carries a batch action into Work and opens the record form once for that batch', async () => {
    const batch = {
      id: 'batch-1',
      ownerId: 'merchant-1',
      fieldId: 'field-1',
      batchNo: 'B-2026-001',
      cropName: '有机稻谷',
      plantDate: '2026-04-01',
      expectedHarvest: '2026-09-01',
      status: 'ACTIVE',
    };
    __setRouterParams({
      id: batch.id,
      batchNo: encodeURIComponent(batch.batchNo),
      cropName: encodeURIComponent(batch.cropName),
    });
    vi.mocked(listBatches).mockResolvedValue([batch]);

    const batchPage = render(<Batch />);

    fireEvent.click(await screen.findByRole('button', { name: '记一笔' }));

    expect(getStorageSync('nongchang:pending-record-intent:v1')).toMatchObject({
      batchId: 'batch-1',
      batchNo: 'B-2026-001',
      cropName: '有机稻谷',
    });
    expect(switchTab).toHaveBeenCalledWith({ url: '/pages/work/index' });

    batchPage.unmount();
    setStorageSync('access_token', 'test-token');
    render(<Work />);

    await waitFor(() => {
      expect(openForBatch).toHaveBeenCalledTimes(1);
      expect(openForBatch).toHaveBeenCalledWith('batch-1');
    });
  });

  it('keeps the newest trace selection when an older request finishes last', async () => {
    const batches = [
      {
        id: 'batch-1', ownerId: 'merchant-1', fieldId: 'field-1', batchNo: 'B-001',
        cropName: '稻谷', plantDate: '2026-04-01', expectedHarvest: '2026-09-01', status: 'ACTIVE',
      },
      {
        id: 'batch-2', ownerId: 'merchant-1', fieldId: 'field-2', batchNo: 'B-002',
        cropName: '玉米', plantDate: '2026-04-02', expectedHarvest: '2026-09-02', status: 'ACTIVE',
      },
    ];
    const resolvers = new Map<string, (events: any[]) => void>();
    vi.mocked(listBatches).mockResolvedValue(batches);
    vi.mocked(listTraceEvents).mockImplementation((batchId) => new Promise((resolve) => {
      resolvers.set(batchId, resolve);
    }));
    setStorageSync('access_token', 'test-token');

    render(<Trace />);

    const secondBatch = await screen.findByRole('button', { name: /B-002/ });
    await waitFor(() => expect(resolvers.has('batch-1')).toBe(true));
    fireEvent.click(secondBatch);
    await waitFor(() => expect(resolvers.has('batch-2')).toBe(true));

    await act(async () => {
      resolvers.get('batch-2')?.([{
        id: 'event-2', tenantId: 'tenant-1', batchId: 'batch-2', type: 'FARM',
        title: '玉米追肥已确认', actor: '张三', location: '二号田',
        occurredAt: '2026-07-13T08:00:00.000Z', createdAt: '2026-07-13T08:00:00.000Z', payload: null,
      }]);
    });
    expect(await screen.findByText('玉米追肥已确认')).toBeTruthy();

    await act(async () => {
      resolvers.get('batch-1')?.([{
        id: 'event-1', tenantId: 'tenant-1', batchId: 'batch-1', type: 'FARM',
        title: '过期稻谷事件', actor: '李四', location: '一号田',
        occurredAt: '2026-07-13T07:00:00.000Z', createdAt: '2026-07-13T07:00:00.000Z', payload: null,
      }]);
    });

    expect(screen.queryByText('过期稻谷事件')).toBeNull();
    expect(screen.getByText('玉米追肥已确认')).toBeTruthy();
    expect(secondBatch.getAttribute('aria-pressed')).toBe('true');
  });

  it('preserves loaded usage rows when append fails and retries the same next page', async () => {
    const first = {
      id: 'ledger-1', resource: 'AI', delta: 10, balanceAfter: 10, reason: 'RECHARGE',
      refType: null, refId: null, note: null, createdAt: '2026-07-13T08:00:00.000Z',
    };
    const second = {
      id: 'ledger-2', resource: 'AI', delta: -2, balanceAfter: 8, reason: 'CONSUME',
      refType: null, refId: null, note: null, createdAt: '2026-07-13T09:00:00.000Z',
    };
    let pageTwoAttempts = 0;
    vi.mocked(listLedger).mockImplementation(async (query) => {
      if ((query.page ?? 1) === 1) {
        return { items: [first], total: 2, page: 1, pageSize: 20 } as any;
      }
      pageTwoAttempts += 1;
      if (pageTwoAttempts === 1) throw new Error('弱网导致加载失败');
      return { items: [second], total: 2, page: 2, pageSize: 20 } as any;
    });
    setStorageSync('access_token', 'test-token');

    const page = render(<Usage />);
    expect(await screen.findByText('充值 · AI算力')).toBeTruthy();
    expect(screen.getByRole('button', { name: '全部资源' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '全部原因' })).toBeTruthy();

    fireEvent.scroll(page.container.querySelector('.usage__ledger')!);

    const retry = await screen.findByRole('button', { name: '重试加载更多' });
    expect(screen.getByText('充值 · AI算力')).toBeTruthy();
    fireEvent.click(retry);

    expect(await screen.findByText('消费 · AI算力')).toBeTruthy();
    expect(screen.getByText('充值 · AI算力')).toBeTruthy();
    expect(pageTwoAttempts).toBe(2);
  });

  it('shows the real registration identifier and refreshes the application status', async () => {
    vi.mocked(registerWechat).mockResolvedValue({
      applicationId: 'application-1',
      status: 'pending',
    });
    vi.mocked(getWechatRegistrationStatus).mockResolvedValue({
      applicationId: 'application-1',
      displayName: '青禾农场',
      status: 'approved',
      updatedAt: null,
    });

    render(<Register />);
    expect(screen.getByRole('button', { name: /已有账号.*返回登录/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.change(screen.getByPlaceholderText('请输入真实姓名或主体名称'), {
      target: { value: '青禾农场' },
    });
    fireEvent.click(screen.getByRole('button', { name: '微信授权并提交' }));

    expect(await screen.findByText('申请编号：application-1')).toBeTruthy();
    expect(screen.getByText('待审核')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '刷新申请状态' }));

    expect(await screen.findByText('已通过')).toBeTruthy();
    expect(getWechatRegistrationStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps profile failure recoverable and opens trace from the Me page', async () => {
    vi.mocked(getMe)
      .mockRejectedValueOnce(new Error('账户资料暂时不可用'))
      .mockResolvedValueOnce({
        id: 'user-1',
        tenantId: 'tenant-1',
        username: 'zhangsan',
        role: 'merchant',
        agentId: null,
        displayName: '张三',
        phone: '13800000000',
        status: 'active',
        deletionVerification: 'password',
      });
    setStorageSync('access_token', 'test-token');

    render(<Me />);

    const retry = await screen.findByRole('button', { name: '重新加载账户' });
    expect(screen.getByRole('alert').textContent).toContain('账户资料暂时不可用');
    fireEvent.click(retry);

    expect(await screen.findByText('张三')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /溯源记录/ }));

    expect(switchTab).toHaveBeenCalledWith({ url: '/pages/trace/index' });
  });

  it('opens dedicated account setting pages and completes their existing forms', async () => {
    const profile = {
      id: 'user-1',
      tenantId: 'tenant-1',
      username: 'zhangsan',
      role: 'merchant' as const,
      agentId: null,
      displayName: '张三',
      phone: '13800000000',
      status: 'active',
      deletionVerification: 'password' as const,
    };
    vi.mocked(getMe).mockResolvedValue(profile);
    vi.mocked(updateMe).mockResolvedValue({ ...profile, displayName: '张三丰' });
    vi.mocked(changePassword).mockResolvedValue({ ok: true });
    setStorageSync('access_token', 'test-token');

    const mePage = render(<Me />);
    fireEvent.click(await screen.findByRole('button', { name: /修改个人资料/ }));
    expect(navigateTo).toHaveBeenCalledWith({ url: '/pages/profile-edit/index' });
    fireEvent.click(screen.getByRole('button', { name: /修改登录密码/ }));
    expect(navigateTo).toHaveBeenCalledWith({ url: '/pages/password-change/index' });
    expect(mePage.container.querySelector('.me__panel')).toBeNull();
    mePage.unmount();

    const profilePage = render(<ProfileEdit />);
    fireEvent.change(await screen.findByDisplayValue('张三'), { target: { value: ' 张三丰 ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }));
    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({
      displayName: '张三丰',
      phone: '13800000000',
    }));
    expect(navigateBack).toHaveBeenCalled();
    profilePage.unmount();

    render(<PasswordChange />);
    fireEvent.change(screen.getByPlaceholderText('请输入原密码'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByPlaceholderText('至少 6 位'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByPlaceholderText('再次输入新密码'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-password', 'new-password'));
    expect(navigateBack).toHaveBeenCalledTimes(2);
  });

  it('keeps a profile-edit load failure recoverable', async () => {
    vi.mocked(getMe)
      .mockRejectedValueOnce(new Error('资料暂时不可用'))
      .mockResolvedValueOnce({
        id: 'user-1', tenantId: 'tenant-1', username: 'zhangsan', role: 'merchant',
        agentId: null, displayName: '张三', phone: null, status: 'active',
        deletionVerification: 'password',
      });

    render(<ProfileEdit />);

    const retry = await screen.findByRole('button', { name: '重新加载账户' });
    expect(screen.getByRole('alert').textContent).toContain('资料暂时不可用');
    fireEvent.click(retry);
    expect(await screen.findByDisplayValue('张三')).toBeTruthy();
  });

  it('renders human account-data labels and supports retryable JSON and CSV exports', async () => {
    vi.mocked(getMyData).mockResolvedValue({
      generatedAt: '2026-07-14T09:00:00.000Z',
      tenant: { id: 'tenant-1', code: 'DEMO', name: '示例机构' },
      account: {
        id: 'user-1', tenantId: 'tenant-1', username: 'zhangsan', role: 'merchant',
        agentId: null, displayName: '张三', phone: null, status: 'active',
        deletionVerification: 'password',
      },
      counts: {
        fields: 0, batches: 0, farmRecords: 0, supplies: 0, supplyIssues: 0,
        uploads: 1, aiOperations: 0, creditOrders: 0, creditLedgers: 0,
      },
      recent: {
        fields: [], batches: [], farmRecords: [], supplies: [], supplyIssues: [],
        uploads: [{
          id: 'opaque-upload-id', purpose: '', url: null, sizeBytes: '128', status: 'ACTIVE',
          createdAt: '2026-07-14T09:00:00.000Z',
        }],
        aiOperations: [], creditOrders: [], creditAccount: null,
      },
      recentLimit: 20,
    });
    vi.mocked(exportMyData)
      .mockRejectedValueOnce(new Error('弱网导致导出失败'))
      .mockResolvedValueOnce('/user-data/account.json')
      .mockResolvedValueOnce('/user-data/account.csv');
    vi.mocked(shareMyData).mockResolvedValue(undefined);

    render(<AccountData />);

    expect(await screen.findByText('未命名上传记录')).toBeTruthy();
    expect(screen.queryByText('opaque-upload-id')).toBeNull();
    expect(screen.queryByText('2026-07-14T09:00:00.000Z')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '导出 JSON 数据副本' }));
    expect(await screen.findByText('弱网导致导出失败')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新导出 JSON' }));
    expect(await screen.findByRole('button', { name: '分享数据副本（JSON）' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '分享数据副本（JSON）' }));
    expect(shareMyData).toHaveBeenCalledWith('/user-data/account.json', 'json');

    fireEvent.click(screen.getByRole('button', { name: '导出 CSV 数据副本' }));
    expect(await screen.findByRole('button', { name: '分享数据副本（CSV）' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '分享数据副本（CSV）' }));
    expect(shareMyData).toHaveBeenCalledWith('/user-data/account.csv', 'csv');
  });
});
