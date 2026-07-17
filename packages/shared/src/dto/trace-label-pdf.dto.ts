import { z } from 'zod';

export const traceLabelPaperSizeSchema = z.enum(['A4', '4x6', '2x1']);
export type TraceLabelPaperSize = z.infer<typeof traceLabelPaperSizeSchema>;

export const TRACE_LABEL_PAPER_DEFAULTS = {
  A4: { marginMm: 8, gapMm: 3, qrSizeMm: 24 },
  '4x6': { marginMm: 6, gapMm: 0, qrSizeMm: 50 },
  '2x1': { marginMm: 2, gapMm: 0, qrSizeMm: 18 },
} as const;

const millimeterSchema = z.number().finite().int();

export const traceLabelPdfInputSchema = z.object({
  codeIds: z.preprocess(
    (value) => Array.isArray(value) ? [...new Set(value)] : value,
    z.array(z.string().uuid()).min(1).max(500),
  ).optional(),
  paperSize: traceLabelPaperSizeSchema.default('A4'),
  marginMm: millimeterSchema.min(0).max(20).optional(),
  gapMm: millimeterSchema.min(0).max(20).optional(),
  qrSizeMm: millimeterSchema.min(15).max(80).optional(),
  showProductName: z.boolean().default(true),
  showSerial: z.boolean().default(true),
}).strict().transform((input) => {
  const defaults = TRACE_LABEL_PAPER_DEFAULTS[input.paperSize];

  return {
    ...input,
    marginMm: input.marginMm ?? defaults.marginMm,
    gapMm: input.gapMm ?? defaults.gapMm,
    qrSizeMm: input.qrSizeMm ?? defaults.qrSizeMm,
  };
});

export type TraceLabelPdfInput = z.input<typeof traceLabelPdfInputSchema>;
export type ResolvedTraceLabelPdfInput = z.output<typeof traceLabelPdfInputSchema>;
