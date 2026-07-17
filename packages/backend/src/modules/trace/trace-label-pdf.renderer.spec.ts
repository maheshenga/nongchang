import { traceLabelPdfInputSchema, type TraceLabelPaperSize } from '@nongchang/shared';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  TraceLabelPdfFontError,
  TraceLabelPdfRenderer,
  renderTraceLabelPdf,
  type TraceLabelPdfRenderDependencies,
  type TraceLabelPdfRenderInput,
} from './trace-label-pdf.renderer';

const ASCII_COPY = {
  batch: 'Batch',
  product: 'Product',
  scanPrompt: 'Scan for public trace',
  page: (current: number, total: number) => `Page ${current} / ${total}`,
};

let pngBytes: Uint8Array;

beforeAll(async () => {
  pngBytes = await QRCode.toBuffer('https://farm.example.test/#/trace/test', {
    type: 'png',
    margin: 4,
    errorCorrectionLevel: 'M',
  });
});

function codes(count: number): Array<{ code: string }> {
  return Array.from({ length: count }, (_, index) => ({ code: `ORC-${String(index + 1).padStart(4, '0')}` }));
}

function input(paperSize: TraceLabelPaperSize, count: number): TraceLabelPdfRenderInput {
  return {
    batchNo: 'BATCH-001',
    cropName: 'Grape',
    codes: codes(count),
    options: traceLabelPdfInputSchema.parse({ paperSize }),
    webBaseUrl: 'https://farm.example.test',
    fontBytes: new Uint8Array([1]),
  };
}

function testDependencies(toQrPng = vi.fn(async () => pngBytes)): TraceLabelPdfRenderDependencies {
  return {
    copy: ASCII_COPY,
    embedFont: (document) => document.embedFont(StandardFonts.Helvetica),
    toQrPng,
    qrConcurrency: 8,
  };
}

describe('trace label PDF renderer', () => {
  it('creates a parseable two-page A4 PDF for 22 real codes and exact public URLs', async () => {
    const toQrPng = vi.fn(async () => pngBytes);
    const result = await renderTraceLabelPdf(input('A4', 22), testDependencies(toQrPng));
    const parsed = await PDFDocument.load(result.bytes);

    expect(Buffer.from(result.bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-');
    expect(result.pageCount).toBe(2);
    expect(parsed.getPageCount()).toBe(2);
    expect(toQrPng).toHaveBeenCalledTimes(22);
    expect(toQrPng).toHaveBeenNthCalledWith(1, 'https://farm.example.test/#/trace/ORC-0001', 'M');
    expect(toQrPng).toHaveBeenNthCalledWith(22, 'https://farm.example.test/#/trace/ORC-0022', 'M');
  });

  it('renders all 500 A4 labels across 24 pages without truncation', async () => {
    const toQrPng = vi.fn(async () => pngBytes);
    const result = await renderTraceLabelPdf(input('A4', 500), testDependencies(toQrPng));
    const parsed = await PDFDocument.load(result.bytes);

    expect(result.pageCount).toBe(24);
    expect(parsed.getPageCount()).toBe(24);
    expect(toQrPng).toHaveBeenCalledTimes(500);
  }, 30_000);

  it.each(['4x6', '2x1'] as const)('renders one %s label per page', async (paperSize) => {
    const result = await renderTraceLabelPdf(input(paperSize, 3), testDependencies());
    const parsed = await PDFDocument.load(result.bytes);

    expect(result.pageCount).toBe(3);
    expect(parsed.getPageCount()).toBe(3);
  });

  it('limits concurrent QR generation to eight jobs', async () => {
    let active = 0;
    let peak = 0;
    const toQrPng = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return pngBytes;
    });

    await renderTraceLabelPdf(input('A4', 22), testDependencies(toQrPng));

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it('maps invalid custom font bytes to a path-free font error before rendering QR codes', async () => {
    await expect(renderTraceLabelPdf(input('A4', 1))).rejects.toBeInstanceOf(TraceLabelPdfFontError);
  });

  it('exposes an injectable production renderer with the same contract', () => {
    expect(new TraceLabelPdfRenderer()).toBeInstanceOf(TraceLabelPdfRenderer);
  });
});
