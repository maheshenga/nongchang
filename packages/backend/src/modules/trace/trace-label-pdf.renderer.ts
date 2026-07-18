import { Injectable } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import type { ResolvedTraceLabelPdfInput } from '@nongchang/shared';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  buildPublicTraceUrl,
  mmToPoints,
  paginateTraceLabels,
  resolveTraceLabelLayout,
  type TraceLabelLayout,
} from './trace-label-pdf.model';

type QrErrorCorrectionLevel = 'M' | 'H';

export interface TraceLabelPdfRenderInput {
  batchNo: string;
  cropName: string;
  codes: ReadonlyArray<{ code: string }>;
  options: ResolvedTraceLabelPdfInput;
  webBaseUrl: string;
  fontBytes: Uint8Array;
}

export interface TraceLabelPdfRenderResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface TraceLabelPdfCopy {
  batch: string;
  product: string;
  scanPrompt: string;
  page: (current: number, total: number) => string;
}

export interface TraceLabelPdfRenderDependencies {
  embedFont?: (document: PDFDocument, fontBytes: Uint8Array) => Promise<PDFFont>;
  toQrPng?: (url: string, level: QrErrorCorrectionLevel) => Promise<Uint8Array>;
  copy?: TraceLabelPdfCopy;
  qrConcurrency?: number;
}

const PRODUCTION_COPY: TraceLabelPdfCopy = {
  batch: '批次',
  product: '品种',
  scanPrompt: '扫码查看公开溯源',
  page: (current, total) => `第 ${current} / ${total} 页`,
};

const BORDER_COLOR = rgb(0.82, 0.84, 0.86);
const TEXT_COLOR = rgb(0.12, 0.14, 0.16);
const MUTED_TEXT_COLOR = rgb(0.35, 0.38, 0.42);

export class TraceLabelPdfFontError extends Error {
  constructor() {
    super('PDF font is unavailable');
    this.name = 'TraceLabelPdfFontError';
  }
}

async function embedProductionFont(document: PDFDocument, fontBytes: Uint8Array): Promise<PDFFont> {
  try {
    document.registerFontkit(fontkit);
    return await document.embedFont(fontBytes, { subset: true });
  } catch {
    throw new TraceLabelPdfFontError();
  }
}

async function createQrPng(url: string, level: QrErrorCorrectionLevel): Promise<Uint8Array> {
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: level,
    margin: 4,
  });
}

function resolveDependencies(overrides: TraceLabelPdfRenderDependencies): Required<TraceLabelPdfRenderDependencies> {
  const qrConcurrency = overrides.qrConcurrency ?? 8;
  if (!Number.isInteger(qrConcurrency) || qrConcurrency < 1) {
    throw new Error('qrConcurrency must be a positive integer');
  }

  return {
    embedFont: overrides.embedFont ?? embedProductionFont,
    toQrPng: overrides.toQrPng ?? createQrPng,
    copy: overrides.copy ?? PRODUCTION_COPY,
    qrConcurrency,
  };
}

function assertFontSupportsRenderedText(
  font: PDFFont,
  layout: TraceLabelLayout,
  input: TraceLabelPdfRenderInput,
  copy: TraceLabelPdfCopy,
  pageCount: number,
): void {
  const renderedText = [
    `${copy.batch}: ${input.batchNo}`,
    copy.scanPrompt,
    ...(input.options.showProductName ? [`${copy.product}: ${input.cropName}`] : []),
    ...(input.options.showSerial ? input.codes.map(({ code }) => code) : []),
    ...(layout.footerHeightPt > 0
      ? Array.from({ length: pageCount }, (_, index) => copy.page(index + 1, pageCount))
      : []),
  ];

  try {
    const characterSet = new Set(font.getCharacterSet());
    for (const text of renderedText) {
      for (const character of Array.from(text)) {
        if (!characterSet.has(character.codePointAt(0)!)) throw new TraceLabelPdfFontError();
      }
    }
  } catch (error) {
    if (error instanceof TraceLabelPdfFontError) throw error;
    throw new TraceLabelPdfFontError();
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  project: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  for (let offset = 0; offset < items.length; offset += concurrency) {
    const chunk = items.slice(offset, offset + concurrency);
    const values = await Promise.all(chunk.map((item, index) => project(item, offset + index)));
    output.push(...values);
  }
  return output;
}

function truncateText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  const suffix = '...';
  const suffixWidth = font.widthOfTextAtSize(suffix, size);
  let result = '';
  for (const character of Array.from(text)) {
    if (font.widthOfTextAtSize(result + character, size) + suffixWidth > maxWidth) break;
    result += character;
  }
  return result ? `${result}${suffix}` : suffix;
}

function fitTextSize(font: PDFFont, text: string, maxWidth: number, preferred: number, minimum = 4): number {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  centerX: number,
  y: number,
  maxWidth: number,
  color = TEXT_COLOR,
): void {
  const visibleText = truncateText(font, text, size, maxWidth);
  const width = font.widthOfTextAtSize(visibleText, size);
  page.drawText(visibleText, { x: centerX - width / 2, y, size, font, color });
}

interface LabelPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

function labelPosition(layout: TraceLabelLayout, pageIndex: number): LabelPosition {
  const column = pageIndex % layout.columns;
  const row = Math.floor(pageIndex / layout.columns);
  return {
    x: layout.marginPt + column * (layout.cellWidthPt + layout.gapPt),
    y: layout.pageHeightPt
      - layout.marginPt
      - (row + 1) * layout.cellHeightPt
      - row * layout.gapPt,
    width: layout.cellWidthPt,
    height: layout.cellHeightPt,
  };
}

function drawCellBorder(page: PDFPage, position: LabelPosition): void {
  page.drawRectangle({
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    borderColor: BORDER_COLOR,
    borderWidth: 0.5,
  });
}

function drawVerticalLabel(
  page: PDFPage,
  font: PDFFont,
  qrImage: Awaited<ReturnType<PDFDocument['embedPng']>>,
  code: string,
  position: LabelPosition,
  qrSize: number,
  input: TraceLabelPdfRenderInput,
  copy: TraceLabelPdfCopy,
): void {
  const compact = input.options.paperSize === 'A4';
  const padding = mmToPoints(compact ? 1 : 3);
  const qrX = position.x + (position.width - qrSize) / 2;
  const qrY = position.y + position.height - qrSize - padding;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const centerX = position.x + position.width / 2;
  const textWidth = position.width - padding * 2;
  let cursorY = qrY - (compact ? 5.5 : 12);
  const primarySize = compact ? 5.2 : 11;
  const secondarySize = compact ? 4.6 : 9;

  drawCenteredText(page, font, `${copy.batch}: ${input.batchNo}`, primarySize, centerX, cursorY, textWidth);
  cursorY -= primarySize + (compact ? 1.2 : 4);
  if (input.options.showProductName) {
    drawCenteredText(page, font, `${copy.product}: ${input.cropName}`, primarySize, centerX, cursorY, textWidth);
    cursorY -= primarySize + (compact ? 1.2 : 4);
  }
  if (input.options.showSerial) {
    const codeSize = fitTextSize(font, code, textWidth, secondarySize);
    drawCenteredText(page, font, code, codeSize, centerX, cursorY, textWidth, MUTED_TEXT_COLOR);
  }
  drawCenteredText(
    page,
    font,
    copy.scanPrompt,
    compact ? 4.2 : 8,
    centerX,
    position.y + padding,
    textWidth,
    MUTED_TEXT_COLOR,
  );
}

function drawCompactLabel(
  page: PDFPage,
  font: PDFFont,
  qrImage: Awaited<ReturnType<PDFDocument['embedPng']>>,
  code: string,
  position: LabelPosition,
  qrSize: number,
  input: TraceLabelPdfRenderInput,
  copy: TraceLabelPdfCopy,
): void {
  const qrX = position.x;
  const qrY = position.y + (position.height - qrSize) / 2;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const gutter = mmToPoints(0.8);
  const textX = qrX + qrSize + gutter;
  const textWidth = position.x + position.width - textX;
  let cursorY = position.y + position.height - 8;
  const batch = truncateText(font, `${copy.batch}: ${input.batchNo}`, 5.2, textWidth);
  page.drawText(batch, { x: textX, y: cursorY, size: 5.2, font, color: TEXT_COLOR });
  cursorY -= 7;
  if (input.options.showProductName) {
    const product = truncateText(font, `${copy.product}: ${input.cropName}`, 5.2, textWidth);
    page.drawText(product, { x: textX, y: cursorY, size: 5.2, font, color: TEXT_COLOR });
    cursorY -= 7;
  }
  if (input.options.showSerial) {
    const size = fitTextSize(font, code, textWidth, 4.8);
    page.drawText(code, { x: textX, y: cursorY, size, font, color: MUTED_TEXT_COLOR });
  }
  page.drawText(truncateText(font, copy.scanPrompt, 4.2, textWidth), {
    x: textX,
    y: position.y + 4,
    size: 4.2,
    font,
    color: MUTED_TEXT_COLOR,
  });
}

function drawPageFooter(
  page: PDFPage,
  font: PDFFont,
  layout: TraceLabelLayout,
  input: TraceLabelPdfRenderInput,
  copy: TraceLabelPdfCopy,
  currentPage: number,
  pageCount: number,
): void {
  if (layout.footerHeightPt <= 0) return;

  const size = 6;
  const y = layout.marginPt + (layout.footerHeightPt - size) / 2;
  page.drawText(truncateText(font, input.batchNo, size, layout.pageWidthPt / 2), {
    x: layout.marginPt,
    y,
    size,
    font,
    color: MUTED_TEXT_COLOR,
  });
  const pageText = copy.page(currentPage, pageCount);
  page.drawText(pageText, {
    x: layout.pageWidthPt - layout.marginPt - font.widthOfTextAtSize(pageText, size),
    y,
    size,
    font,
    color: MUTED_TEXT_COLOR,
  });
}

export async function renderTraceLabelPdf(
  input: TraceLabelPdfRenderInput,
  dependencyOverrides: TraceLabelPdfRenderDependencies = {},
): Promise<TraceLabelPdfRenderResult> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const layout = resolveTraceLabelLayout(input.options);
  const pages = paginateTraceLabels(input.codes, layout.capacity);
  const document = await PDFDocument.create();
  const font = await dependencies.embedFont(document, input.fontBytes);
  assertFontSupportsRenderedText(font, layout, input, dependencies.copy, pages.length);
  const qrLevel: QrErrorCorrectionLevel = input.options.paperSize === 'A4' ? 'M' : 'H';

  document.setTitle(`Trace labels ${input.batchNo}`);
  document.setSubject('Public trace QR labels');
  document.setProducer('Nongchang trace label service');

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageCodes = pages[pageIndex];
    const page = document.addPage([layout.pageWidthPt, layout.pageHeightPt]);
    const qrPngs = await mapWithConcurrency(
      pageCodes,
      dependencies.qrConcurrency,
      ({ code }) => dependencies.toQrPng(buildPublicTraceUrl(input.webBaseUrl, code), qrLevel),
    );

    for (let labelIndex = 0; labelIndex < pageCodes.length; labelIndex += 1) {
      const position = labelPosition(layout, labelIndex);
      const qrImage = await document.embedPng(qrPngs[labelIndex]);
      drawCellBorder(page, position);
      if (layout.direction === 'horizontal') {
        drawCompactLabel(
          page,
          font,
          qrImage,
          pageCodes[labelIndex].code,
          position,
          layout.qrSizePt,
          input,
          dependencies.copy,
        );
      } else {
        drawVerticalLabel(
          page,
          font,
          qrImage,
          pageCodes[labelIndex].code,
          position,
          layout.qrSizePt,
          input,
          dependencies.copy,
        );
      }
    }

    drawPageFooter(page, font, layout, input, dependencies.copy, pageIndex + 1, pages.length);
  }

  const bytes = await document.save({ useObjectStreams: true });
  return { bytes, pageCount: pages.length };
}

@Injectable()
export class TraceLabelPdfRenderer {
  render(input: TraceLabelPdfRenderInput): Promise<TraceLabelPdfRenderResult> {
    return renderTraceLabelPdf(input);
  }
}
