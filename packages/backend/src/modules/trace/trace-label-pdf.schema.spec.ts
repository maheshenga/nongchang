import { describe, expect, it } from 'vitest';
import {
  TRACE_LABEL_PAPER_DEFAULTS,
  traceLabelPdfInputSchema,
  type ResolvedTraceLabelPdfInput,
  type TraceLabelPdfInput,
} from '@nongchang/shared';

describe('trace label PDF input schema', () => {
  it.each([
    ['A4', { marginMm: 8, gapMm: 3, qrSizeMm: 24 }],
    ['4x6', { marginMm: 6, gapMm: 0, qrSizeMm: 50 }],
    ['2x1', { marginMm: 2, gapMm: 0, qrSizeMm: 18 }],
  ] as const)('applies %s defaults', (paperSize, expected) => {
    expect(traceLabelPdfInputSchema.parse({ paperSize })).toMatchObject({
      paperSize,
      ...expected,
      showProductName: true,
      showSerial: true,
    });
  });

  it('deduplicates UUIDs before enforcing the 500-code cap', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(traceLabelPdfInputSchema.parse({ codeIds: [id, id] }).codeIds).toEqual([id]);
  });

  it('defaults paper size to A4 and rejects unknown fields', () => {
    expect(traceLabelPdfInputSchema.parse({})).toMatchObject({
      paperSize: 'A4',
      ...TRACE_LABEL_PAPER_DEFAULTS.A4,
    });
    expect(() => traceLabelPdfInputSchema.parse({ unexpected: true })).toThrow();
  });

  it.each([
    { codeIds: [] },
    { codeIds: ['not-a-uuid'] },
    { codeIds: Array.from({ length: 501 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`) },
    { paperSize: 'letter' },
  ])('rejects invalid code IDs and paper sizes: %o', (input) => {
    expect(() => traceLabelPdfInputSchema.parse(input)).toThrow();
  });

  it.each([
    ['marginMm', -1],
    ['marginMm', 21],
    ['gapMm', -1],
    ['gapMm', 21],
    ['qrSizeMm', 14],
    ['qrSizeMm', 81],
    ['marginMm', 1.5],
    ['gapMm', Number.POSITIVE_INFINITY],
    ['qrSizeMm', Number.NaN],
  ] as const)('rejects an invalid %s value of %s', (field, value) => {
    expect(() => traceLabelPdfInputSchema.parse({ [field]: value })).toThrow();
  });

  it('keeps input optional and resolves parsed output', () => {
    const input: TraceLabelPdfInput = { codeIds: ['00000000-0000-4000-8000-000000000001'] };
    const parsed: ResolvedTraceLabelPdfInput = traceLabelPdfInputSchema.parse(input);

    expect(parsed).toMatchObject({
      codeIds: input.codeIds,
      paperSize: 'A4',
      showProductName: true,
      showSerial: true,
    });
  });
});
