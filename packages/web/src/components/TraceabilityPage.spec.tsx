import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TraceabilityPage from './TraceabilityPage';

const traceMocks = vi.hoisted(() => ({
  fetchPublicTrace: vi.fn(),
  TraceLookupError: class TraceLookupError extends Error {
    constructor(public kind: 'not-found' | 'network', message: string) {
      super(message);
      this.name = 'TraceLookupError';
    }
  },
}));

vi.mock('../api/trace', () => traceMocks);
vi.mock('./TiandituMap', () => ({ default: () => <div>Origin map</div> }));

const source = () => readFileSync(join(process.cwd(), 'src/components/TraceabilityPage.tsx'), 'utf8');

const publicTrace = {
  code: 'TRACE-1',
  frozen: false,
  scanCount: 7,
  tiandituKey: 'tdt-key',
  batch: {
    batchNo: 'B-TRACE-1',
    cropName: 'Peony',
    merchantName: '大理基地',
    plantDate: '2026-06-01T00:00:00.000Z',
    expectedHarvest: '2026-08-01T00:00:00.000Z',
    status: 'growing',
    fieldName: 'Field A',
    fieldLng: 102.1,
    fieldLat: 25.1,
    region: 'Yunnan',
  },
  events: [
    {
      type: 'farm',
      title: 'Planting',
      actor: 'Operator A',
      location: 'Field A',
      occurredAt: '2026-07-01T08:00:00.000Z',
      payload: { desc: 'Seedling record', tag: 'farm-record' },
    },
  ],
  eventTotal: 1,
  credentials: [
    {
      type: 'certificate',
      title: 'Organic Cert',
      issuer: 'Agency',
      serialNo: 'CERT-1',
      issuedAt: '2026-07-02T00:00:00.000Z',
      fileUrl: 'https://cdn.example.test/cert.pdf',
    },
  ],
  credentialTotal: 1,
};

describe('TraceabilityPage Fluent trust boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    traceMocks.fetchPublicTrace.mockResolvedValue(publicTrace);
  });

  it('uses Fluent primitives and excludes legacy marketing and overclaiming copy', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('bg-emerald');
    expect(text).not.toContain('hover:bg-emerald');
    expect(text).not.toContain('border-slate');
    expect(text).not.toContain('text-slate');
    expect(text).not.toContain('bg-slate');
    expect(text).not.toContain('shadow-2xl');
    expect(text).not.toContain('block integrity');
    expect(text).not.toContain('signatures');
    expect(text).not.toContain('正品认证通过');
    expect(text).not.toContain('真实有效');
  });

  it('renders public trace data and credential evidence from the real fetch result', async () => {
    render(<TraceabilityPage code="TRACE-1" />);

    expect(await screen.findByText('Peony')).toBeTruthy();
    expect(traceMocks.fetchPublicTrace).toHaveBeenCalledWith('TRACE-1');
    expect(screen.getByText('B-TRACE-1')).toBeTruthy();
    expect(screen.getByText('大理基地')).toBeTruthy();
    expect(screen.getByText('本次查询时间')).toBeTruthy();
    expect(screen.getByText(/累计扫码次数会随每次公开查询增加/)).toBeTruthy();
    expect(screen.getByText('Planting')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '报告异常' }));
    const summary = screen.getByLabelText('异常报告摘要') as HTMLTextAreaElement;
    expect(summary.value).toContain('TRACE-1');
    expect(summary.value).toContain('大理基地');

    fireEvent.click(screen.getByRole('button', { name: '凭证' }));
    expect(await screen.findByText('Organic Cert')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Organic Cert/ }).getAttribute('href')).toBe('https://cdn.example.test/cert.pdf');
  });

  it('renders a frozen-code boundary without implying successful authenticity', async () => {
    traceMocks.fetchPublicTrace.mockResolvedValue({ code: 'TRACE-FROZEN', frozen: true });

    render(<TraceabilityPage code="TRACE-FROZEN" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/TRACE-FROZEN/)).toBeTruthy();
    expect(screen.getByLabelText('重新输入溯源码')).toBeTruthy();
  });

  it('renders distinct missing and network recovery states', async () => {
    traceMocks.fetchPublicTrace.mockRejectedValueOnce(new traceMocks.TraceLookupError('not-found', '溯源码无效或不存在'));
    const { unmount } = render(<TraceabilityPage code="MISSING" />);

    expect(await screen.findByRole('heading', { name: '未找到该溯源码' })).toBeTruthy();
    expect(screen.getByLabelText('重新输入溯源码')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重新查询' })).toBeNull();

    unmount();
    traceMocks.fetchPublicTrace.mockRejectedValueOnce(new traceMocks.TraceLookupError('network', '网络连接失败'));
    render(<TraceabilityPage code="NETWORK" />);

    expect(await screen.findByRole('heading', { name: '网络连接异常' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新查询' }));
    await waitFor(() => expect(traceMocks.fetchPublicTrace).toHaveBeenCalledTimes(3));
  });

  it('keeps empty evidence states factual without authenticity overclaims', async () => {
    traceMocks.fetchPublicTrace.mockResolvedValue({
      ...publicTrace,
      events: [],
      eventTotal: 0,
      credentials: [],
      credentialTotal: 0,
    });
    render(<TraceabilityPage code="TRACE-EMPTY" />);

    expect(await screen.findByText('暂无公开生产记录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '凭证' }));
    expect(await screen.findByText('暂无公开资质或检测文件')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/正品认证通过|真实有效/);
  });
});
