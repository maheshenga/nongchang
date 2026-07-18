import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchAdmin from './BatchAdmin';

const batchApiMock = vi.hoisted(() => ({
  listBatches: vi.fn(),
  createBatch: vi.fn(),
  getBatchLifecycle: vi.fn(),
  deleteBatch: vi.fn(),
}));

const fieldApiMock = vi.hoisted(() => ({
  listFields: vi.fn(),
}));

const traceApiMock = vi.hoisted(() => ({
  createTraceGenerationRequestKey: vi.fn(() => 'test-key'),
  generateCodes: vi.fn(),
  listCodes: vi.fn(),
  createTraceLabelPdf: vi.fn(),
}));

vi.mock('../api/batches', () => batchApiMock);
vi.mock('../api/fields', () => fieldApiMock);
vi.mock('../api/trace', () => traceApiMock);
vi.mock('./BatchCredentialModal', () => ({ default: () => null }));

const batches = [
  {
    id: 'batch-1',
    tenantId: 'tenant-1',
    ownerId: 'owner-1',
    ownerName: '张三农场',
    fieldId: 'A区-葡萄园-01',
    batchNo: 'B20240520001',
    cropName: '阳光玫瑰葡萄',
    plantDate: '2024-05-20T09:15:00.000Z',
    expectedHarvest: '2024-07-01T00:00:00.000Z',
    status: 'Growing',
    createdAt: '2024-05-20T09:15:00.000Z',
    laborCost: 1200,
    sellPrice: 5000,
    codeCount: 10000,
    scanTotal: 2345,
    inputCost: 800,
  },
  {
    id: 'batch-2',
    tenantId: 'tenant-1',
    ownerId: 'owner-2',
    ownerName: '李四农场',
    fieldId: 'C区-樱桃园-03',
    batchNo: 'B20240518003',
    cropName: '美早樱桃',
    plantDate: '2024-05-18T09:15:00.000Z',
    expectedHarvest: '2024-06-01T00:00:00.000Z',
    status: 'Harvested',
    createdAt: '2024-05-18T09:15:00.000Z',
    laborCost: 900,
    sellPrice: 4000,
    codeCount: 5000,
    scanTotal: 5000,
    inputCost: 600,
  },
];

const traceCode = (index: number, batchId = 'batch-1') => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  tenantId: 'tenant-1',
  batchId,
  code: `TRACE-${batchId}-${index}`,
  scanCount: index,
  createdAt: '2026-07-18T00:00:00.000Z',
});

const pdfFile = () => ({
  blob: new Blob(['%PDF-test'], { type: 'application/pdf' }),
  fileName: 'trace-labels.pdf',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function openGenerationDialog() {
  fireEvent.click((await screen.findAllByRole('button', { name: '生码' }))[0]);
  return screen.findByRole('dialog', { name: '生成溯源标签' });
}

async function confirmGeneration() {
  fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));
  const confirm = await screen.findByRole('button', { name: '确认 生成' });
  await act(async () => {
    fireEvent.click(confirm);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('BatchAdmin Fluent console', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchApiMock.listBatches.mockResolvedValue(batches);
    batchApiMock.getBatchLifecycle.mockResolvedValue({ farmRecords: [], traceEvents: [], codeCount: 0, scanTotal: 0 });
    fieldApiMock.listFields.mockResolvedValue([]);
    traceApiMock.generateCodes.mockResolvedValue([]);
    traceApiMock.listCodes.mockResolvedValue([]);
    traceApiMock.createTraceLabelPdf.mockResolvedValue(pdfFile());
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:labels') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('renders Fluent batch command bar and table columns', async () => {
    render(<BatchAdmin />);

    expect(await screen.findByRole('heading', { name: /批次全生命周期管理/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /新建批次/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /导出/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /筛选/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeTruthy();
    expect(screen.getByPlaceholderText('按批次号搜索')).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: /批次号/ })).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: /签发码数/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /扫码量/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /已生成码/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /合规/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /资质/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /利润/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /报告/ })).toHaveLength(2);
  });

  it('filters visible rows by batch code', async () => {
    render(<BatchAdmin />);

    expect(await screen.findByText('B20240520001')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('按批次号搜索'), { target: { value: '18003' } });

    await waitFor(() => expect(screen.queryByText('B20240520001')).toBeNull());
    expect(screen.getByText('B20240518003')).toBeTruthy();
  });

  it('locks create batch form and ignores duplicate submits while creation is pending', async () => {
    fieldApiMock.listFields.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId: 'tenant-1',
        ownerId: '22222222-2222-4222-8222-222222222222',
        ownerName: '张三农场',
        name: 'A区葡萄园',
        area: 12,
        lng: 120.1,
        lat: 30.2,
        iotDeviceId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    let resolveCreate: (() => void) | undefined;
    batchApiMock.createBatch.mockImplementation(() => new Promise<void>((resolve) => { resolveCreate = resolve; }));

    render(<BatchAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: /新建批次/ }));
    fireEvent.change(screen.getByLabelText('批次号'), { target: { value: 'B20260709001' } });
    fireEvent.change(screen.getByLabelText('品种'), { target: { value: '阳光玫瑰' } });
    fireEvent.change(screen.getByLabelText('种植日期'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('预计收获'), { target: { value: '2026-09-01' } });

    const submit = screen.getByRole('button', { name: '创建' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    expect(batchApiMock.createBatch).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: '提交中…' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('所属地块') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText('批次号') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('品种') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('种植日期') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('预计收获') as HTMLInputElement).disabled).toBe(true);

    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '新建批次' })).toBeNull();
    });
  });

  it('hands generated TraceCode ids and the selected paper size to the real PDF workspace', async () => {
    const codes = [traceCode(1), traceCode(2)];
    traceApiMock.generateCodes.mockResolvedValue(codes);
    render(<BatchAdmin />);

    await openGenerationDialog();
    fireEvent.change(screen.getByLabelText('纸张规格'), { target: { value: '2x1' } });
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '2' } });
    await confirmGeneration();

    await waitFor(() => expect(traceApiMock.createTraceLabelPdf).toHaveBeenCalledWith(
      'batch-1',
      expect.objectContaining({
        codeIds: codes.map((code) => code.id),
        paperSize: '2x1',
      }),
    ));
    expect(traceApiMock.generateCodes).toHaveBeenCalledWith('batch-1', 2, 'test-key');
    expect(screen.getByLabelText('溯源标签 PDF 工作区')).toBeTruthy();
  });

  it('limits label generation to the same 500-code PDF boundary', async () => {
    render(<BatchAdmin />);

    await openGenerationDialog();
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '500' } });
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '501' } });
    expect(screen.getByRole('alert').textContent).toContain('1 ~ 500');
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('preserves generation inputs after code failure and never requests a PDF', async () => {
    traceApiMock.generateCodes.mockRejectedValueOnce(new Error('generation failed'));
    render(<BatchAdmin />);

    await openGenerationDialog();
    fireEvent.change(screen.getByLabelText('纸张规格'), { target: { value: 'A4' } });
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '7' } });
    await confirmGeneration();

    await waitFor(() => expect(traceApiMock.generateCodes).toHaveBeenCalledOnce());
    expect(traceApiMock.createTraceLabelPdf).not.toHaveBeenCalled();
    expect((screen.getByLabelText('纸张规格') as HTMLSelectElement).value).toBe('A4');
    expect((screen.getByLabelText('生成数量') as HTMLInputElement).value).toBe('7');
  });

  it('locks generation cancellation after the quota-consuming request starts', async () => {
    const pending = deferred<ReturnType<typeof traceCode>[]>();
    traceApiMock.generateCodes.mockReturnValueOnce(pending.promise);
    render(<BatchAdmin />);

    await openGenerationDialog();
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));
    fireEvent.click(screen.getByRole('button', { name: '确认 生成' }));

    await waitFor(() => expect(traceApiMock.generateCodes).toHaveBeenCalledOnce());
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '关闭生成设置' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '暂缓生成' }) as HTMLButtonElement).disabled).toBe(true);

    pending.resolve([traceCode(1)]);
    expect(await screen.findByLabelText('溯源标签 PDF 工作区')).toBeTruthy();
  });

  it('distinguishes generated codes from a failed label file and retries only the PDF', async () => {
    traceApiMock.generateCodes.mockResolvedValueOnce([traceCode(1)]);
    traceApiMock.createTraceLabelPdf
      .mockRejectedValueOnce(Object.assign(new Error('font unavailable'), { status: 503 }))
      .mockResolvedValueOnce(pdfFile());
    render(<BatchAdmin />);

    await openGenerationDialog();
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '1' } });
    await confirmGeneration();

    expect(await screen.findByText('PDF 服务暂不可用，请联系管理员检查公开站点和 PDF 字体配置。')).toBeTruthy();
    expect(screen.getByText(/溯源码已生成.*标签文件生成失败/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试生成' }));
    await screen.findByRole('link', { name: '下载 PDF' });
    expect(traceApiMock.generateCodes).toHaveBeenCalledTimes(1);
    expect(traceApiMock.createTraceLabelPdf).toHaveBeenCalledTimes(2);
  });

  it('selects existing codes and exports selected or all without losing the modal context', async () => {
    const codes = [{ ...traceCode(1), code: 'TRACE / 1' }, traceCode(2)];
    traceApiMock.listCodes.mockResolvedValueOnce(codes);
    render(<BatchAdmin />);

    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[0]);
    const codesDialog = await screen.findByRole('dialog', { name: '已生成溯源码' });
    expect(within(codesDialog).getAllByRole('link', { name: '打开' })[0].getAttribute('href')).toContain('TRACE%20%2F%201');
    fireEvent.click(within(codesDialog).getByRole('button', { name: '全选' }));
    expect(within(codesDialog).getByText('已选择 2 / 500')).toBeTruthy();
    fireEvent.click(within(codesDialog).getByRole('button', { name: '取消选择' }));
    fireEvent.click(within(codesDialog).getByRole('checkbox', { name: `选择溯源码 ${codes[0].code}` }));
    fireEvent.click(within(codesDialog).getByRole('button', { name: '导出选中（1）' }));

    await waitFor(() => expect(traceApiMock.createTraceLabelPdf).toHaveBeenLastCalledWith(
      'batch-1',
      expect.objectContaining({ codeIds: [codes[0].id] }),
    ));
    fireEvent.click(within(screen.getByLabelText('溯源标签 PDF 工作区')).getByRole('button', { name: '关闭' }));
    expect(screen.getByRole('dialog', { name: '已生成溯源码' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '导出全部' }));
    await waitFor(() => {
      const input = traceApiMock.createTraceLabelPdf.mock.calls.at(-1)?.[1];
      expect(input).not.toHaveProperty('codeIds');
    });
  });

  it('keeps the existing-code dialog inside the mobile viewport with a wrapping header', async () => {
    traceApiMock.listCodes.mockResolvedValueOnce([traceCode(1)]);
    render(<BatchAdmin />);

    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: '已生成溯源码' });
    const heading = within(dialog).getByRole('heading', { name: /已生成溯源码/ });
    const batchNo = within(heading).getByText('B20240520001');
    const close = within(dialog).getByRole('button', { name: '关闭已生成码' });

    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('overflow-y-auto');
    expect(heading.className).toContain('flex-wrap');
    expect(heading.className).toContain('min-w-0');
    expect(batchNo.className).toContain('break-all');
    expect(close.className).toContain('shrink-0');
  });

  it('clears existing-code selection when the list closes or switches batch', async () => {
    traceApiMock.listCodes
      .mockResolvedValueOnce([traceCode(1)])
      .mockResolvedValueOnce([traceCode(2, 'batch-2')]);
    render(<BatchAdmin />);

    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[0]);
    let dialog = await screen.findByRole('dialog', { name: '已生成溯源码' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /选择溯源码/ }));
    expect(within(dialog).getByText('已选择 1 / 500')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭已生成码' }));

    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[1]);
    dialog = await screen.findByRole('dialog', { name: '已生成溯源码' });
    expect(within(dialog).getByText('已选择 0 / 500')).toBeTruthy();
  });

  it('ignores a stale code-list response after closing and switching batch', async () => {
    const first = deferred<ReturnType<typeof traceCode>[]>();
    const second = deferred<ReturnType<typeof traceCode>[]>();
    traceApiMock.listCodes
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<BatchAdmin />);

    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[0]);
    let dialog = await screen.findByRole('dialog', { name: '已生成溯源码' });
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭已生成码' }));
    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[1]);
    dialog = await screen.findByRole('dialog', { name: '已生成溯源码' });

    await act(async () => {
      second.resolve([traceCode(2, 'batch-2')]);
      await second.promise;
    });
    expect(await within(dialog).findByText('TRACE-batch-2-2')).toBeTruthy();
    await act(async () => {
      first.resolve([traceCode(1, 'batch-1')]);
      await first.promise;
    });
    await waitFor(() => expect(within(dialog).queryByText('TRACE-batch-1-1')).toBeNull());
    expect(within(dialog).getByText('TRACE-batch-2-2')).toBeTruthy();
  });

  it('limits an oversized existing-code export to 500 selected ids', async () => {
    const codes = Array.from({ length: 501 }, (_, index) => traceCode(index + 1));
    traceApiMock.listCodes.mockResolvedValueOnce(codes);
    render(<BatchAdmin />);

    fireEvent.click((await screen.findAllByRole('button', { name: '已生成码' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: '已生成溯源码' });
    expect(within(dialog).getByText('单次最多 500，请分批选择')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: '导出全部' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: '全选' }) as HTMLButtonElement).disabled).toBe(true);

    const checkboxes = within(dialog).getAllByRole('checkbox', { name: /选择溯源码/ });
    fireEvent.click(within(dialog).getByRole('button', { name: '选择前 500 个' }));
    expect(within(dialog).getByText('已选择 500 / 500')).toBeTruthy();
    expect((checkboxes[500] as HTMLInputElement).disabled).toBe(true);
  }, 10_000);
});
