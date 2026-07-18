import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Printer, RefreshCw, X } from 'lucide-react';
import {
  TRACE_LABEL_PAPER_DEFAULTS,
  type TraceLabelPaperSize,
  type TraceLabelPdfInput,
} from '@nongchang/shared';
import { createTraceLabelPdf } from '../../api/trace';

interface BatchLabelWorkspaceProps {
  batchId: string;
  batchNo: string;
  cropName: string;
  codeIds?: string[];
  labelCount: number;
  initialPaperSize?: TraceLabelPaperSize;
  onClose: () => void;
}

interface PdfPreview {
  blob: Blob;
  objectUrl: string;
  fileName: string;
  layout: LayoutForm;
}

type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; preview: PdfPreview }
  | { status: 'error'; message: string };

interface LayoutForm {
  paperSize: TraceLabelPaperSize;
  marginMm: number;
  gapMm: number;
  qrSizeMm: number;
  showProductName: boolean;
  showSerial: boolean;
}

const paperSizes: Array<{ value: TraceLabelPaperSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: '4x6', label: '4x6' },
  { value: '2x1', label: '2x1' },
];

const A4_LABELS_PER_PAGE = 21;

function makeLayoutForm(paperSize: TraceLabelPaperSize): LayoutForm {
  return {
    paperSize,
    ...TRACE_LABEL_PAPER_DEFAULTS[paperSize],
    showProductName: true,
    showSerial: true,
  };
}

function layoutsMatch(left: LayoutForm, right: LayoutForm): boolean {
  return left.paperSize === right.paperSize
    && left.marginMm === right.marginMm
    && left.gapMm === right.gapMm
    && left.qrSizeMm === right.qrSizeMm
    && left.showProductName === right.showProductName
    && left.showSerial === right.showSerial;
}

function errorMessage(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 400) return '请求参数无效，请检查标签设置后重试。';
  if (status === 403) return '没有导出该批次标签的权限。';
  if (status === 503) return 'PDF 服务暂不可用，请联系管理员检查公开站点和 PDF 字体配置。';
  return error instanceof Error && error.message
    ? error.message
    : 'PDF 生成失败，请稍后重试。';
}

function safeFileName(batchNo: string): string {
  const safeBatchNo = batchNo
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '') || 'batch';
  return `trace-labels-${safeBatchNo}.pdf`;
}

function pageCount(labelCount: number, paperSize: TraceLabelPaperSize): number {
  if (labelCount <= 0) return 0;
  return paperSize === 'A4' ? Math.ceil(labelCount / A4_LABELS_PER_PAGE) : labelCount;
}

export default function BatchLabelWorkspace({
  batchId,
  batchNo,
  cropName,
  codeIds,
  labelCount,
  initialPaperSize = 'A4',
  onClose,
}: BatchLabelWorkspaceProps) {
  const [form, setForm] = useState<LayoutForm>(() => makeLayoutForm(initialPaperSize));
  const [workspace, setWorkspace] = useState<WorkspaceState>({ status: 'loading' });
  const [printHint, setPrintHint] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const startedRef = useRef(false);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const releasePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releasePreviewUrl();
    };
  }, [releasePreviewUrl]);

  const generatePreview = useCallback(async () => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    const requestId = ++requestIdRef.current;
    setPrintHint(null);
    setWorkspace({ status: 'loading' });
    const input: TraceLabelPdfInput = {
      paperSize: form.paperSize,
      marginMm: form.marginMm,
      gapMm: form.gapMm,
      qrSizeMm: form.qrSizeMm,
      showProductName: form.showProductName,
      showSerial: form.showSerial,
      ...(codeIds === undefined ? {} : { codeIds }),
    };

    try {
      const file = await createTraceLabelPdf(batchId, input);
      const objectUrl = URL.createObjectURL(file.blob);
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      releasePreviewUrl();
      previewUrlRef.current = objectUrl;
      setWorkspace({
        status: 'ready',
        preview: {
          blob: file.blob,
          objectUrl,
          fileName: file.fileName || safeFileName(batchNo),
          layout: { ...form },
        },
      });
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      releasePreviewUrl();
      setWorkspace({ status: 'error', message: errorMessage(error) });
    } finally {
      if (requestId === requestIdRef.current) loadingRef.current = false;
    }
  }, [batchId, batchNo, codeIds, form, releasePreviewUrl]);

  useEffect(() => {
    const start = window.setTimeout(() => {
      if (!startedRef.current) {
        startedRef.current = true;
        void generatePreview();
      }
    }, 0);
    return () => window.clearTimeout(start);
  }, [generatePreview]);

  const selectPaperSize = (paperSize: TraceLabelPaperSize) => {
    setForm((previous) => ({
      ...makeLayoutForm(paperSize),
      showProductName: previous.showProductName,
      showSerial: previous.showSerial,
    }));
  };

  const updateNumber = (field: 'marginMm' | 'gapMm' | 'qrSizeMm', value: string) => {
    setForm((previous) => ({ ...previous, [field]: Number(value) }));
  };

  const handlePrint = () => {
    if (workspace.status !== 'ready' || !layoutsMatch(workspace.preview.layout, form)) return;
    const printWindow = window.open(workspace.preview.objectUrl, '_blank');
    if (!printWindow) {
      setPrintHint('打印窗口被浏览器拦截，请下载 PDF 后打印。');
      return;
    }
    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
  };

  const isLoading = workspace.status === 'loading';
  const previewIsCurrent = workspace.status === 'ready' && layoutsMatch(workspace.preview.layout, form);
  const summaryPages = pageCount(labelCount, form.paperSize);

  return (
    <section className="min-w-0 bg-white p-4 text-[#323130] sm:p-6" aria-label="溯源标签 PDF 工作区">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#E1DFDD] pb-4">
        <div>
          <h2 className="text-lg font-semibold">溯源标签 PDF</h2>
          <p className="mt-1 text-sm text-[#605E5C]">{cropName} · 批次 {batchNo}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
          className="inline-flex h-9 w-9 items-center justify-center border border-[#8A8886] text-[#323130] hover:bg-[#F3F2F1]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-[#E1DFDD] pb-5 lg:border-b-0 lg:border-r lg:pr-5">
          <fieldset>
            <legend className="text-sm font-semibold">纸张规格</legend>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="纸张规格">
              {paperSizes.map((paper) => (
                <label
                  key={paper.value}
                  className={`cursor-pointer border px-3 py-2 text-sm ${form.paperSize === paper.value ? 'border-[#0078D4] bg-[#EFF6FC]' : 'border-[#8A8886]'}`}
                >
                  <input
                    type="radio"
                    name="paperSize"
                    value={paper.value}
                    checked={form.paperSize === paper.value}
                    onChange={() => selectPaperSize(paper.value)}
                    className="sr-only"
                  />
                  {paper.label} 纸张规格
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {([
              ['marginMm', '边距'],
              ['gapMm', '间距'],
              ['qrSizeMm', '二维码尺寸'],
            ] as const).map(([field, label]) => (
              <label key={field} className="text-sm font-medium">
                {label}
                <span className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={field === 'qrSizeMm' ? 15 : 0}
                    max={field === 'qrSizeMm' ? 80 : 20}
                    step="1"
                    value={form[field]}
                    onChange={(event) => updateNumber(field, event.target.value)}
                    className="min-w-0 flex-1 border border-[#8A8886] px-2 py-1.5"
                  />
                  <span className="text-[#605E5C]">mm</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5 space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.showProductName}
                onChange={(event) => setForm((previous) => ({ ...previous, showProductName: event.target.checked }))}
              />
              显示产品名称
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.showSerial}
                onChange={(event) => setForm((previous) => ({ ...previous, showSerial: event.target.checked }))}
              />
              显示序列号
            </label>
          </div>

          <p className="mt-5 text-sm text-[#605E5C]">导出已生成溯源码不会再次扣减二维码额度。</p>
          <p className="mt-2 text-sm font-medium">{labelCount} 张标签 / {summaryPages} 页</p>
          {workspace.status === 'ready' && !previewIsCurrent && (
            <p className="mt-2 text-sm text-[#A4262C]" role="status">标签设置已更改，请先更新预览再下载或打印。</p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void generatePreview()}
              disabled={isLoading}
              aria-label="更新预览"
              title="更新预览"
              className="inline-flex items-center gap-2 border border-[#0078D4] bg-[#0078D4] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              更新预览
            </button>
            {workspace.status === 'ready' && previewIsCurrent ? (
              <a
                href={workspace.preview.objectUrl}
                download={workspace.preview.fileName}
                aria-label="下载 PDF"
                title="下载 PDF"
                className="inline-flex items-center gap-2 border border-[#8A8886] px-3 py-2 text-sm font-semibold hover:bg-[#F3F2F1]"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                下载 PDF
              </a>
            ) : (
              <button
                type="button"
                disabled
                aria-label="下载 PDF"
                title="下载 PDF"
                className="inline-flex items-center gap-2 border border-[#8A8886] px-3 py-2 text-sm font-semibold opacity-60"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                下载 PDF
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={!previewIsCurrent}
              aria-label="打印 PDF"
              title="打印 PDF"
              className="inline-flex items-center gap-2 border border-[#8A8886] px-3 py-2 text-sm font-semibold hover:bg-[#F3F2F1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              打印 PDF
            </button>
          </div>
        </div>

        <div className="min-w-0">
          {workspace.status === 'loading' && (
            <div className="flex min-h-96 items-center justify-center border border-[#E1DFDD] text-sm text-[#605E5C]" role="status">
              正在生成 PDF 预览…
            </div>
          )}
          {workspace.status === 'error' && (
            <div className="border border-[#A4262C] bg-[#FDE7E9] p-4 text-sm text-[#A4262C]" role="alert">
              <p>{workspace.message}</p>
              <button
                type="button"
                onClick={() => void generatePreview()}
                className="mt-3 inline-flex items-center gap-2 border border-current px-3 py-2 font-semibold"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                重试生成
              </button>
            </div>
          )}
          {workspace.status === 'ready' && (
            <iframe
              title="溯源标签 PDF 预览"
              src={workspace.preview.objectUrl}
              className="min-h-96 w-full border border-[#E1DFDD]"
            />
          )}
          {printHint && <p className="mt-3 text-sm text-[#A4262C]" role="status">{printHint}</p>}
        </div>
      </div>
    </section>
  );
}
