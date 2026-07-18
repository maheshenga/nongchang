import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTraceLabelPdfMock = vi.fn();
vi.mock('../../api/trace', () => ({
  createTraceLabelPdf: (...args: unknown[]) => createTraceLabelPdfMock(...args),
}));

import BatchLabelWorkspace from './BatchLabelWorkspace';

function pdfFile(name = 'trace-labels-BATCH-001.pdf') {
  return {
    blob: new Blob(['%PDF-test'], { type: 'application/pdf' }),
    fileName: name,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('BatchLabelWorkspace', () => {
  const createObjectURL = vi.fn(() => 'blob:trace-label-pdf');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    createTraceLabelPdfMock.mockReset().mockResolvedValue(pdfFile());
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  });

  it('loads selected codes once and derives the real 21-label A4 capacity', async () => {
    const codeIds = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        codeIds={codeIds}
        labelCount={21}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(1));
    expect(createTraceLabelPdfMock).toHaveBeenCalledWith('batch-1', expect.objectContaining({
      codeIds,
      paperSize: 'A4',
      marginMm: 8,
      gapMm: 3,
      qrSizeMm: 24,
    }));
    expect(screen.getByText('21 张标签 / 1 页')).toBeTruthy();
    expect(screen.getByTitle('溯源标签 PDF 预览').getAttribute('src')).toBe('blob:trace-label-pdf');
  });

  it('reuses the same Blob URL for preview, download, and printing without another request', async () => {
    const print = vi.fn();
    const popup = {
      opener: null,
      addEventListener: vi.fn((_event: string, listener: () => void) => listener()),
      print,
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as never);
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={1}
        onClose={vi.fn()}
      />,
    );

    const download = await screen.findByRole('link', { name: '下载 PDF' });
    fireEvent.click(screen.getByRole('button', { name: '打印 PDF' }));

    expect(download.getAttribute('href')).toBe('blob:trace-label-pdf');
    expect(download.getAttribute('download')).toBe('trace-labels-BATCH-001.pdf');
    expect(open).toHaveBeenCalledWith('blob:trace-label-pdf', '_blank');
    expect(print).toHaveBeenCalledOnce();
    expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(1);
  });

  it('blocks download and printing when the layout no longer matches the ready PDF', async () => {
    createObjectURL
      .mockReturnValueOnce('blob:a4')
      .mockReturnValueOnce('blob:4x6');
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={22}
        onClose={vi.fn()}
      />,
    );

    await screen.findByRole('link', { name: '下载 PDF' });
    fireEvent.click(screen.getByLabelText('4x6 纸张规格'));

    expect(screen.getByText('标签设置已更改，请先更新预览再下载或打印。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '下载 PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '打印 PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('22 张标签 / 22 页')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '更新预览' }));
    const download = await screen.findByRole('link', { name: '下载 PDF' });
    expect(download.getAttribute('href')).toBe('blob:4x6');
    expect(screen.queryByText('标签设置已更改，请先更新预览再下载或打印。')).toBeNull();
    expect(createTraceLabelPdfMock).toHaveBeenLastCalledWith('batch-1', expect.objectContaining({ paperSize: '4x6' }));
  });

  it('keeps the download available and explains how to proceed when printing is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={1}
        onClose={vi.fn()}
      />,
    );

    await screen.findByRole('link', { name: '下载 PDF' });
    fireEvent.click(screen.getByRole('button', { name: '打印 PDF' }));

    expect(screen.getByRole('link', { name: '下载 PDF' })).toBeTruthy();
    expect(screen.getByText('打印窗口被浏览器拦截，请下载 PDF 后打印。')).toBeTruthy();
  });

  it('disables commands while loading and ignores duplicate update clicks', async () => {
    const initial = deferred<ReturnType<typeof pdfFile>>();
    createTraceLabelPdfMock.mockReturnValueOnce(initial.promise);
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={1}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(1));
    const update = screen.getByRole('button', { name: '更新预览' }) as HTMLButtonElement;
    expect(update.disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下载 PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '打印 PDF' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(update);
    fireEvent.click(update);
    expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(1);

    initial.resolve(pdfFile());
    await screen.findByRole('link', { name: '下载 PDF' });

    const next = deferred<ReturnType<typeof pdfFile>>();
    createTraceLabelPdfMock.mockReturnValueOnce(next.promise);
    fireEvent.click(screen.getByLabelText('4x6 纸张规格'));
    fireEvent.click(screen.getByRole('button', { name: '更新预览' }));
    fireEvent.click(screen.getByRole('button', { name: '更新预览' }));
    expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(2);
    next.resolve(pdfFile('trace-labels-4x6.pdf'));
    await waitFor(() => expect(screen.getByText('1 张标签 / 1 页')).toBeTruthy());
  });

  it('revokes replaced, unmounted, and stale Blob URLs', async () => {
    createObjectURL
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
      .mockReturnValueOnce('blob:stale');
    const { unmount } = render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={1}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('link', { name: '下载 PDF' });

    fireEvent.click(screen.getByRole('button', { name: '更新预览' }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:first'));
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');
  });

  it('revokes an in-flight Blob URL that resolves after unmounting', async () => {
    const pending = deferred<ReturnType<typeof pdfFile>>();
    createObjectURL.mockReturnValueOnce('blob:stale');
    createTraceLabelPdfMock.mockReturnValueOnce(pending.promise);
    const { unmount } = render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={1}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(1));
    unmount();
    pending.resolve(pdfFile());

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale');
    });
    expect(screen.queryByTitle('溯源标签 PDF 预览')).toBeNull();
  });

  it.each([
    ['A4', 22, '22 张标签 / 2 页'],
    ['4x6', 3, '3 张标签 / 3 页'],
    ['2x1', 3, '3 张标签 / 3 页'],
  ] as const)('reports the %s page total from labelCount', async (paperSize, labelCount, summary) => {
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={labelCount}
        initialPaperSize={paperSize}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText(summary)).toBeTruthy();
  });

  it.each([
    [400, '请求参数无效，请检查标签设置后重试。'],
    [403, '没有导出该批次标签的权限。'],
  ])('shows a visible %i error without creating a download link', async (status, message) => {
    createTraceLabelPdfMock.mockRejectedValueOnce(Object.assign(new Error('server detail'), { status }));
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={3}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('link', { name: '下载 PDF' })).toBeNull();
  });

  it('shows a configuration-specific 503 error, supports retry, and exports all without codeIds', async () => {
    createTraceLabelPdfMock.mockRejectedValueOnce(Object.assign(new Error('PDF 中文字体不可用'), { status: 503 }));
    render(
      <BatchLabelWorkspace
        batchId="batch-1"
        batchNo="BATCH-001"
        cropName="阳光玫瑰"
        labelCount={3}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('PDF 服务暂不可用，请联系管理员检查公开站点和 PDF 字体配置。')).toBeTruthy();
    expect(createTraceLabelPdfMock.mock.calls[0][1]).not.toHaveProperty('codeIds');
    fireEvent.click(screen.getByRole('button', { name: '重试生成' }));

    await screen.findByRole('link', { name: '下载 PDF' });
    expect(createTraceLabelPdfMock).toHaveBeenCalledTimes(2);
  });
});
