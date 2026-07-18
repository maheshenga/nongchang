import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { traceLabelPdfInputSchema, Role, type AuthUser } from '@nongchang/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceLabelPdfFontError } from './trace-label-pdf.renderer';
import { TraceLabelPdfService } from './trace-label-pdf.service';

const merchant: AuthUser = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  role: Role.MERCHANT,
  agentId: null,
  ownerId: 'owner-1',
};

let tempDirectory: string;
let fontPath: string;
let originalWebBaseUrl: string | undefined;
let originalFontPath: string | undefined;
let originalNodeEnv: string | undefined;

function codeRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    code: `ORC-${String(index).padStart(4, '0')}`,
    createdAt: new Date(1_700_000_000_000 + index),
    tenantId: 'tenant-1',
    internalNote: 'must not reach renderer',
    ...overrides,
  };
}

function makeHarness(rows = [codeRow(1), codeRow(2)]) {
  const order: string[] = [];
  const scope = {
    assertInScope: vi.fn(async () => { order.push('scope'); }),
  };
  const prisma = {
    batch: {
      findFirst: vi.fn(async () => {
        order.push('batch');
        return { batchNo: 'BATCH-001', cropName: '阳光玫瑰' };
      }),
    },
    traceCode: {
      findMany: vi.fn(async () => {
        order.push('codes');
        return rows;
      }),
    },
  };
  const renderer = {
    render: vi.fn(async () => {
      order.push('render');
      return { bytes: new Uint8Array(Buffer.from('%PDF-test')), pageCount: 1 };
    }),
  };

  return {
    service: new TraceLabelPdfService(prisma as never, scope as never, renderer as never),
    prisma,
    scope,
    renderer,
    order,
  };
}

beforeAll(async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), 'nongchang-trace-label-'));
  fontPath = join(tempDirectory, 'font.ttf');
  originalWebBaseUrl = process.env.WEB_BASE_URL;
  originalFontPath = process.env.TRACE_PDF_FONT_PATH;
  originalNodeEnv = process.env.NODE_ENV;
});

beforeEach(async () => {
  process.env.WEB_BASE_URL = 'https://farm.example.test';
  process.env.TRACE_PDF_FONT_PATH = fontPath;
  process.env.NODE_ENV = 'test';
  await writeFile(fontPath, Buffer.from('test-font-bytes'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (originalWebBaseUrl === undefined) delete process.env.WEB_BASE_URL;
  else process.env.WEB_BASE_URL = originalWebBaseUrl;
  if (originalFontPath === undefined) delete process.env.TRACE_PDF_FONT_PATH;
  else process.env.TRACE_PDF_FONT_PATH = originalFontPath;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe('TraceLabelPdfService scope and selection', () => {
  it('checks scope first and performs only tenant+batch ordered reads', async () => {
    const harness = makeHarness();
    const result = await harness.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({}));

    expect(harness.order).toEqual(['scope', 'batch', 'codes', 'render']);
    expect(harness.scope.assertInScope).toHaveBeenCalledWith(harness.prisma, merchant, 'batch', 'batch-1');
    expect(harness.prisma.batch.findFirst).toHaveBeenCalledWith({
      where: { id: 'batch-1', tenantId: 'tenant-1' },
      select: { batchNo: true, cropName: true },
    });
    expect(harness.prisma.traceCode.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', batchId: 'batch-1' },
      select: { id: true, code: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 501,
    });
    expect(result).toMatchObject({ fileName: 'trace-labels-BATCH-001.pdf', labelCount: 2, pageCount: 1 });
  });

  it('queries selected IDs inside tenant+batch and renders only an exact set', async () => {
    const rows = [codeRow(2), codeRow(1)];
    const harness = makeHarness(rows);
    const codeIds = [rows[0].id, rows[1].id];

    await harness.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({ codeIds }));

    expect(harness.prisma.traceCode.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', batchId: 'batch-1', id: { in: codeIds } },
      select: { id: true, code: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(harness.renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      codes: [{ code: rows[0].code }, { code: rows[1].code }],
    }));
  });

  it('rejects a mixed or missing selected ID set without partial rendering', async () => {
    const harness = makeHarness([codeRow(1)]);
    const codeIds = [codeRow(1).id, randomUUID()];

    await expect(harness.service.create(
      merchant,
      'batch-1',
      traceLabelPdfInputSchema.parse({ codeIds }),
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.renderer.render).not.toHaveBeenCalled();
  });

  it('rejects an empty or over-limit all-code snapshot before rendering', async () => {
    const empty = makeHarness([]);
    await expect(empty.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(empty.renderer.render).not.toHaveBeenCalled();

    const overLimit = makeHarness(Array.from({ length: 501 }, (_, index) => codeRow(index + 1)));
    await expect(overLimit.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(overLimit.renderer.render).not.toHaveBeenCalled();
  });

  it('fails closed if the batch disappears after the scope check', async () => {
    const harness = makeHarness();
    harness.prisma.batch.findFirst.mockResolvedValueOnce(null as never);

    await expect(harness.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.prisma.traceCode.findMany).not.toHaveBeenCalled();
  });

  it('passes only approved label fields to the renderer and performs no writes', async () => {
    const harness = makeHarness([codeRow(1)]);

    await harness.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({ paperSize: '4x6' }));

    expect(harness.renderer.render).toHaveBeenCalledWith({
      batchNo: 'BATCH-001',
      cropName: '阳光玫瑰',
      codes: [{ code: 'ORC-0001' }],
      options: traceLabelPdfInputSchema.parse({ paperSize: '4x6' }),
      webBaseUrl: 'https://farm.example.test',
      fontBytes: expect.any(Uint8Array),
    });
    expect(Object.keys(harness.prisma)).toEqual(['batch', 'traceCode']);
  });
});

describe('TraceLabelPdfService configuration', () => {
  it('fails with 503 for missing or production-insecure WEB_BASE_URL', async () => {
    delete process.env.WEB_BASE_URL;
    await expect(makeHarness().service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(ServiceUnavailableException);

    process.env.WEB_BASE_URL = 'http://farm.example.test';
    process.env.NODE_ENV = 'production';
    await expect(makeHarness().service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails with 503 for a missing, non-file, or unsupported font path', async () => {
    delete process.env.TRACE_PDF_FONT_PATH;
    await expect(makeHarness().service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(ServiceUnavailableException);

    process.env.TRACE_PDF_FONT_PATH = join(tempDirectory, 'font.ttc');
    await writeFile(process.env.TRACE_PDF_FONT_PATH, Buffer.from('font-collection'));
    await expect(makeHarness().service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(ServiceUnavailableException);

    process.env.TRACE_PDF_FONT_PATH = tempDirectory;
    await expect(makeHarness().service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('caches font bytes only after a successful read', async () => {
    const harness = makeHarness([codeRow(1)]);
    await harness.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({}));
    await rm(fontPath, { force: true });

    await expect(harness.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .resolves.toMatchObject({ labelCount: 1 });
  });

  it('maps invalid embedded fonts to 503 without exposing the path and preserves unexpected errors', async () => {
    const fontFailure = makeHarness();
    fontFailure.renderer.render.mockRejectedValueOnce(new TraceLabelPdfFontError());
    await expect(fontFailure.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toMatchObject({ status: 503, message: expect.not.stringContaining(fontPath) });

    const unexpected = makeHarness();
    unexpected.renderer.render.mockRejectedValueOnce(new Error('renderer exploded'));
    await expect(unexpected.service.create(merchant, 'batch-1', traceLabelPdfInputSchema.parse({})))
      .rejects.toThrow('renderer exploded');
  });
});
