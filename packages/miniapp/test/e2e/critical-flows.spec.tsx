import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '../../src/pages/login';
import Batch from '../../src/pages/batch';
import Me from '../../src/pages/me';
import Register from '../../src/pages/register';
import Trace from '../../src/pages/trace';
import Usage from '../../src/pages/usage';
import Work from '../../src/pages/work';
import {
  getWechatRegistrationStatus,
  getMe,
  login,
  loginWechat,
  registerWechat,
} from '../../src/api/auth';
import { listBatches, listFarmRecords, listFields } from '../../src/api/farm';
import { getBillingSummary, listLedger } from '../../src/api/billing';
import { request } from '../../src/api/request';
import { listQuickTemplates } from '../../src/api/quickTemplate';
import { listTraceEvents } from '../../src/api/trace';
import {
  __setRouterParams,
  getStorageSync,
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
  });

  it('requires authorization for both login methods and locks WeChat while password login is pending', async () => {
    render(<Login />);

    expect(screen.getByRole('button', { name: /申请入驻/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));
    fireEvent.click(screen.getByRole('button', { name: '微信一键登录' }));

    expect(login).not.toHaveBeenCalled();
    expect(loginWechat).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('请先阅读并同意隐私与授权说明');

    fireEvent.change(screen.getByPlaceholderText('请输入机构编码'), { target: { value: ' acme ' } });
    fireEvent.change(screen.getByPlaceholderText('手机号 / 用户名'), { target: { value: ' admin ' } });
    fireEvent.change(screen.getByPlaceholderText('请输入服务密码'), { target: { value: ' secret ' } });
    fireEvent.click(screen.getByRole('checkbox'));

    let resolveLogin!: () => void;
    vi.mocked(login).mockImplementation(() => new Promise<void>((resolve) => {
      resolveLogin = resolve;
    }));

    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('ACME', 'admin', 'secret');
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
});
