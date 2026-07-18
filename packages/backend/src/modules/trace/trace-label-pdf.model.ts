import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ResolvedTraceLabelPdfInput, TraceLabelPaperSize } from '@nongchang/shared';

const MILLIMETERS_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const MIN_COMPACT_TEXT_WIDTH_MM = 22;

const PAPER_MM = {
  A4: { width: 210, height: 297, columns: 3, rows: 7, footer: 8 },
  '4x6': { width: 101.6, height: 152.4, columns: 1, rows: 1, footer: 0 },
  '2x1': { width: 50.8, height: 25.4, columns: 1, rows: 1, footer: 0 },
} as const;

const VERTICAL_TEXT_BAND_MM: Partial<Record<TraceLabelPaperSize, number>> = {
  A4: 8,
  '4x6': 28,
};

export interface TraceLabelLayout {
  paperSize: TraceLabelPaperSize;
  pageWidthPt: number;
  pageHeightPt: number;
  marginPt: number;
  gapPt: number;
  footerHeightPt: number;
  cellWidthPt: number;
  cellHeightPt: number;
  qrSizePt: number;
  columns: number;
  rows: number;
  capacity: number;
  direction: 'vertical' | 'horizontal';
}

export function mmToPoints(millimeters: number): number {
  return millimeters * POINTS_PER_INCH / MILLIMETERS_PER_INCH;
}

function rejectInvalidLayout(): never {
  throw new BadRequestException('标签布局无法容纳二维码和必要文本，请减小边距、间距或二维码尺寸');
}

export function resolveTraceLabelLayout(input: ResolvedTraceLabelPdfInput): TraceLabelLayout {
  const paper = PAPER_MM[input.paperSize];
  const availableWidthMm = paper.width - input.marginMm * 2;
  const availableHeightMm = paper.height - input.marginMm * 2 - paper.footer;
  const cellWidthMm = (availableWidthMm - input.gapMm * (paper.columns - 1)) / paper.columns;
  const cellHeightMm = (availableHeightMm - input.gapMm * (paper.rows - 1)) / paper.rows;

  if (
    !Number.isFinite(cellWidthMm)
    || !Number.isFinite(cellHeightMm)
    || cellWidthMm <= 0
    || cellHeightMm <= 0
  ) {
    rejectInvalidLayout();
  }

  if (input.paperSize === '2x1') {
    const remainingTextWidthMm = cellWidthMm - input.qrSizeMm;
    if (input.qrSizeMm > cellHeightMm || remainingTextWidthMm < MIN_COMPACT_TEXT_WIDTH_MM) {
      rejectInvalidLayout();
    }
  } else {
    const textBandMm = VERTICAL_TEXT_BAND_MM[input.paperSize];
    if (
      textBandMm === undefined
      || input.qrSizeMm > cellWidthMm
      || input.qrSizeMm + textBandMm > cellHeightMm
    ) {
      rejectInvalidLayout();
    }
  }

  return {
    paperSize: input.paperSize,
    pageWidthPt: mmToPoints(paper.width),
    pageHeightPt: mmToPoints(paper.height),
    marginPt: mmToPoints(input.marginMm),
    gapPt: mmToPoints(input.gapMm),
    footerHeightPt: mmToPoints(paper.footer),
    cellWidthPt: mmToPoints(cellWidthMm),
    cellHeightPt: mmToPoints(cellHeightMm),
    qrSizePt: mmToPoints(input.qrSizeMm),
    columns: paper.columns,
    rows: paper.rows,
    capacity: paper.columns * paper.rows,
    direction: input.paperSize === '2x1' ? 'horizontal' : 'vertical',
  };
}

export function paginateTraceLabels<T>(labels: readonly T[], capacity: number): T[][] {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new BadRequestException('标签分页容量必须为正整数');
  }

  const pages: T[][] = [];
  for (let offset = 0; offset < labels.length; offset += capacity) {
    pages.push(labels.slice(offset, offset + capacity));
  }
  return pages;
}

export function normalizeTraceWebBaseUrl(raw: string | undefined, nodeEnv = process.env.NODE_ENV): string {
  const candidate = raw?.trim();
  if (!candidate) {
    throw new ServiceUnavailableException('公开溯源站点地址未配置');
  }

  try {
    const parsed = new URL(candidate);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp || (nodeEnv === 'production' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
      throw new Error('invalid public trace URL');
    }

    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    throw new ServiceUnavailableException('公开溯源站点地址不可用');
  }
}

export function buildPublicTraceUrl(webBaseUrl: string, code: string): string {
  return `${webBaseUrl}/#/trace/${encodeURIComponent(code)}`;
}

function sanitizeAsciiFileSegment(value: string, maxLength: number): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, maxLength)
    .replace(/[._-]+$/g, '');
}

export function buildTraceLabelPdfFileName(batchNo: string): string {
  const safeBatchNo = sanitizeAsciiFileSegment(batchNo, 80) || 'batch';
  return `trace-labels-${safeBatchNo}.pdf`;
}

export function buildTraceLabelContentDisposition(fileName: string): string {
  const safeFileName = sanitizeAsciiFileSegment(fileName, 120) || 'trace-labels.pdf';
  const encodedFileName = encodeURIComponent(safeFileName);
  return `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
}
