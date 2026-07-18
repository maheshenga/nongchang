import { z } from 'zod';

export const traceLabelPaperSizeSchema = z.enum(['A4', '4x6', '2x1']);
export type TraceLabelPaperSize = z.infer<typeof traceLabelPaperSizeSchema>;

export const TRACE_LABEL_PAPER_DEFAULTS = {
  A4: { marginMm: 8, gapMm: 3, qrSizeMm: 24 },
  '4x6': { marginMm: 6, gapMm: 0, qrSizeMm: 50 },
  '2x1': { marginMm: 2, gapMm: 0, qrSizeMm: 18 },
} as const;

const millimeterSchema = z.number().finite().int();
const traceLabelCodeIdsSchema = z.array(z.string().uuid()).min(1).superRefine((codeIds, context) => {
  if (new Set(codeIds).size > 500) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'codeIds must contain at most 500 unique IDs',
    });
  }
}).transform((codeIds) => [...new Set(codeIds)]);

export const traceLabelPdfInputSchema = z.object({
  codeIds: traceLabelCodeIdsSchema.optional(),
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
