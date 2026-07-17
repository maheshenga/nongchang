import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { traceLabelPdfInputSchema } from '@nongchang/shared';
import { describe, expect, it } from 'vitest';
import {
  buildPublicTraceUrl,
  buildTraceLabelContentDisposition,
  buildTraceLabelPdfFileName,
  mmToPoints,
  normalizeTraceWebBaseUrl,
  paginateTraceLabels,
  resolveTraceLabelLayout,
} from './trace-label-pdf.model';

describe('trace label PDF layout model', () => {
  it('converts millimeters to PDF points', () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72, 10);
  });

  it('resolves A4 to 210x297mm with 3x7 labels', () => {
    const layout = resolveTraceLabelLayout(traceLabelPdfInputSchema.parse({ paperSize: 'A4' }));

    expect(layout).toMatchObject({ paperSize: 'A4', columns: 3, rows: 7, capacity: 21 });
    expect(layout.pageWidthPt).toBeCloseTo(mmToPoints(210), 10);
    expect(layout.pageHeightPt).toBeCloseTo(mmToPoints(297), 10);
    expect(layout.cellWidthPt).toBeGreaterThan(layout.qrSizePt);
    expect(layout.cellHeightPt).toBeGreaterThan(layout.qrSizePt);
  });

  it.each([
    ['4x6', 4, 6],
    ['2x1', 2, 1],
  ] as const)('resolves %s to one label per physical inch-sized page', (paperSize, widthInches, heightInches) => {
    const layout = resolveTraceLabelLayout(traceLabelPdfInputSchema.parse({ paperSize }));

    expect(layout.capacity).toBe(1);
    expect(layout.pageWidthPt).toBeCloseTo(widthInches * 72, 10);
    expect(layout.pageHeightPt).toBeCloseTo(heightInches * 72, 10);
  });

  it('paginates all labels in stable order without mutating the input', () => {
    const labels = Object.freeze(Array.from({ length: 500 }, (_, index) => ({ index })));
    const pages = paginateTraceLabels(labels, 21);

    expect(pages).toHaveLength(24);
    expect(pages.flat()).toEqual(labels);
    expect(paginateTraceLabels(labels.slice(0, 22), 21)).toHaveLength(2);
    expect(labels).toHaveLength(500);
  });

  it('rejects layouts that cannot contain the QR quiet-zone image and text', () => {
    expect(() => resolveTraceLabelLayout(traceLabelPdfInputSchema.parse({
      paperSize: 'A4',
      qrSizeMm: 80,
    }))).toThrow(BadRequestException);

    expect(() => resolveTraceLabelLayout(traceLabelPdfInputSchema.parse({
      paperSize: '2x1',
      marginMm: 20,
    }))).toThrow(BadRequestException);

    expect(() => resolveTraceLabelLayout(traceLabelPdfInputSchema.parse({
      paperSize: '2x1',
      qrSizeMm: 40,
    }))).toThrow(BadRequestException);
  });

  it('rejects invalid pagination capacity', () => {
    expect(() => paginateTraceLabels([1], 0)).toThrow(BadRequestException);
    expect(() => paginateTraceLabels([1], 1.5)).toThrow(BadRequestException);
  });
});

describe('trace label PDF URL model', () => {
  it('normalizes a root URL and preserves a deployment subpath', () => {
    expect(normalizeTraceWebBaseUrl('https://farm.example.com/', 'production'))
      .toBe('https://farm.example.com');
    expect(normalizeTraceWebBaseUrl('https://farm.example.com/console///', 'production'))
      .toBe('https://farm.example.com/console');
  });

  it.each([
    [undefined, 'production'],
    ['', 'production'],
    ['http://farm.example.com', 'production'],
    ['/relative/path', 'development'],
    ['javascript:alert(1)', 'development'],
  ] as const)('fails closed for an invalid public base URL', (raw, nodeEnv) => {
    expect(() => normalizeTraceWebBaseUrl(raw, nodeEnv)).toThrow(ServiceUnavailableException);
  });

  it('allows local HTTP outside production and encodes the trace code', () => {
    const baseUrl = normalizeTraceWebBaseUrl('http://127.0.0.1:5173/', 'development');

    expect(buildPublicTraceUrl(baseUrl, 'ORC/A B'))
      .toBe('http://127.0.0.1:5173/#/trace/ORC%2FA%20B');
  });
});

describe('trace label PDF filename model', () => {
  it('sanitizes paths, quotes, whitespace, and newlines from the batch number', () => {
    expect(buildTraceLabelPdfFileName('../../B\r\n" 01/../../'))
      .toBe('trace-labels-B-01.pdf');
  });

  it('limits the safe batch segment and falls back when no ASCII remains', () => {
    const fileName = buildTraceLabelPdfFileName('A'.repeat(100));

    expect(fileName).toBe(`trace-labels-${'A'.repeat(80)}.pdf`);
    expect(buildTraceLabelPdfFileName('中文批次')).toBe('trace-labels-batch.pdf');
  });

  it('builds an RFC 5987 attachment header without header injection', () => {
    const header = buildTraceLabelContentDisposition('trace-labels-B-01.pdf\r\nX-Test: yes');

    expect(header).toContain('attachment; filename="trace-labels-B-01.pdf-X-Test-yes"');
    expect(header).toContain("filename*=UTF-8''trace-labels-B-01.pdf-X-Test-yes");
    expect(header).not.toMatch(/[\r\n]/);
  });
});
