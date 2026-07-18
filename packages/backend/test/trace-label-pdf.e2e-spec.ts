import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BatchStatus, Role } from '@nongchang/shared';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resolveTraceLabelLayout } from '../src/modules/trace/trace-label-pdf.model';
import {
  TraceLabelPdfRenderer,
  type TraceLabelPdfRenderInput,
} from '../src/modules/trace/trace-label-pdf.renderer';

const HOOK_TIMEOUT_MS = 30_000;
type CleanupStep = readonly [string, () => Promise<unknown> | unknown];

async function runCleanupSteps(steps: CleanupStep[]): Promise<void> {
  const errors: Error[] = [];
  for (const [name, cleanup] of steps) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Trace label PDF e2e cleanup failed');
}

async function parsePdfResponseBody(response: request.Response): Promise<Buffer> {
  if (Buffer.isBuffer(response.body)) return response.body;
  if (response.text) return Buffer.from(response.text, 'binary');
  throw new Error('PDF response did not contain a binary body');
}

describe('POST /api/trace/codes/:batchId/labels.pdf e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let ownerAId: string;
  let ownerBId: string;
  let fieldAId: string;
  let fieldBId: string;
  let selectedBatchId: string;
  let emptyBatchId: string;
  let largeBatchId: string;
  let foreignBatchId: string;
  let tokenA: string;
  let tokenB: string;
  let selectedCodes: Array<{ id: string; code: string }>;
  let selectedCodeIds: string[];
  let largeCodeIds: string[];
  let foreignCodeId: string;
  let tempDirectory: string;
  let fontPath: string;
  let originalWebBaseUrl: string | undefined;
  let originalFontPath: string | undefined;
  let originalNodeEnv: string | undefined;
  const fixtureTag = `PDF${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

  const renderer = {
    render: vi.fn(async (input: TraceLabelPdfRenderInput) => {
      const layout = resolveTraceLabelLayout(input.options);
      const pageCount = Math.ceil(input.codes.length / layout.capacity);
      const document = await PDFDocument.create();
      for (let index = 0; index < pageCount; index += 1) {
        document.addPage([layout.pageWidthPt, layout.pageHeightPt]);
      }
      return { bytes: await document.save(), pageCount };
    }),
  };

  beforeAll(async () => {
    originalWebBaseUrl = process.env.WEB_BASE_URL;
    originalFontPath = process.env.TRACE_PDF_FONT_PATH;
    originalNodeEnv = process.env.NODE_ENV;
    tempDirectory = await mkdtemp(join(tmpdir(), 'nongchang-trace-label-e2e-'));
    fontPath = join(tempDirectory, 'font.ttf');
    await writeFile(fontPath, Buffer.from('e2e-font-placeholder'));
    process.env.WEB_BASE_URL = 'https://farm.example.test';
    process.env.TRACE_PDF_FONT_PATH = fontPath;
    process.env.NODE_ENV = 'test';

    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });
    moduleBuilder.overrideProvider(TraceLabelPdfRenderer).useValue(renderer);
    const moduleRef = await moduleBuilder.compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 10);
    const tenantA = await prisma.tenant.create({
      data: { name: `${fixtureTag} Tenant A`, code: `${fixtureTag}A` },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `${fixtureTag} Tenant B`, code: `${fixtureTag}B` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const [userA, ownerA, userB, ownerB] = await Promise.all([
      prisma.user.create({
        data: {
          tenantId: tenantAId,
          username: `${fixtureTag.toLowerCase()}-admin-a`,
          passwordHash,
          role: Role.SYSTEM_ADMIN,
          displayName: `${fixtureTag} Admin A`,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenantAId,
          username: `${fixtureTag.toLowerCase()}-owner-a`,
          passwordHash,
          role: Role.MERCHANT,
          displayName: `${fixtureTag} Owner A`,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenantBId,
          username: `${fixtureTag.toLowerCase()}-admin-b`,
          passwordHash,
          role: Role.SYSTEM_ADMIN,
          displayName: `${fixtureTag} Admin B`,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenantBId,
          username: `${fixtureTag.toLowerCase()}-owner-b`,
          passwordHash,
          role: Role.MERCHANT,
          displayName: `${fixtureTag} Owner B`,
        },
      }),
    ]);
    userAId = userA.id;
    ownerAId = ownerA.id;
    userBId = userB.id;
    ownerBId = ownerB.id;

    const [fieldA, fieldB] = await Promise.all([
      prisma.field.create({ data: { tenantId: tenantAId, ownerId: ownerAId, name: `${fixtureTag} Field A`, area: 1 } }),
      prisma.field.create({ data: { tenantId: tenantBId, ownerId: ownerBId, name: `${fixtureTag} Field B`, area: 1 } }),
    ]);
    fieldAId = fieldA.id;
    fieldBId = fieldB.id;

    const baseBatch = {
      plantDate: new Date('2026-01-01T00:00:00.000Z'),
      expectedHarvest: new Date('2026-09-01T00:00:00.000Z'),
      status: BatchStatus.GROWING,
    };
    const [selectedBatch, emptyBatch, largeBatch, foreignBatch] = await Promise.all([
      prisma.batch.create({
        data: {
          tenantId: tenantAId, ownerId: ownerAId, fieldId: fieldAId,
          batchNo: `${fixtureTag}-SELECTED`, cropName: '阳光玫瑰', ...baseBatch,
        },
      }),
      prisma.batch.create({
        data: {
          tenantId: tenantAId, ownerId: ownerAId, fieldId: fieldAId,
          batchNo: `${fixtureTag}-EMPTY`, cropName: '空批次', ...baseBatch,
        },
      }),
      prisma.batch.create({
        data: {
          tenantId: tenantAId, ownerId: ownerAId, fieldId: fieldAId,
          batchNo: `${fixtureTag}-LARGE`, cropName: '大批次', ...baseBatch,
        },
      }),
      prisma.batch.create({
        data: {
          tenantId: tenantBId, ownerId: ownerBId, fieldId: fieldBId,
          batchNo: `${fixtureTag}-FOREIGN`, cropName: '外部批次', ...baseBatch,
        },
      }),
    ]);
    selectedBatchId = selectedBatch.id;
    emptyBatchId = emptyBatch.id;
    largeBatchId = largeBatch.id;
    foreignBatchId = foreignBatch.id;

    await prisma.traceCode.createMany({
      data: [1, 2, 3].map((index) => ({
        tenantId: tenantAId,
        batchId: selectedBatchId,
        code: `${fixtureTag}-SELECTED-${index}`,
      })),
    });
    await prisma.traceCode.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        tenantId: tenantAId,
        batchId: largeBatchId,
        code: `${fixtureTag}-LARGE-${String(index + 1).padStart(3, '0')}`,
      })),
    });
    const foreignCode = await prisma.traceCode.create({
      data: { tenantId: tenantBId, batchId: foreignBatchId, code: `${fixtureTag}-FOREIGN-1` },
    });
    foreignCodeId = foreignCode.id;

    selectedCodes = await prisma.traceCode.findMany({
      where: { tenantId: tenantAId, batchId: selectedBatchId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true },
    });
    selectedCodeIds = selectedCodes.map(({ id }) => id);
    largeCodeIds = (await prisma.traceCode.findMany({
      where: { tenantId: tenantAId, batchId: largeBatchId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    })).map(({ id }) => id);

    tokenA = (await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantCode: `${fixtureTag}A`,
      username: `${fixtureTag.toLowerCase()}-admin-a`,
      password: 'password123',
    }).expect(201)).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantCode: `${fixtureTag}B`,
      username: `${fixtureTag.toLowerCase()}-admin-b`,
      password: 'password123',
    }).expect(201)).body.accessToken;
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await runCleanupSteps([
      ['trace codes', async () => {
        if (prisma && tenantAId && tenantBId) {
          await prisma.traceCode.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        }
      }],
      ['batches', async () => {
        if (prisma && tenantAId && tenantBId) {
          await prisma.batch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        }
      }],
      ['fields', async () => {
        if (prisma && tenantAId && tenantBId) {
          await prisma.field.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        }
      }],
      ['users', async () => {
        if (prisma && tenantAId && tenantBId) {
          await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        }
      }],
      ['tenants', async () => {
        if (prisma && tenantAId && tenantBId) {
          await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
        }
      }],
      ['fixture audit', async () => {
        if (prisma) {
          expect(await prisma.tenant.count({ where: { code: { startsWith: fixtureTag } } })).toBe(0);
          expect(await prisma.traceCode.count({ where: { code: { startsWith: fixtureTag } } })).toBe(0);
        }
      }],
      ['temporary font', async () => {
        if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
      }],
      ['app close', async () => {
        if (app) await app.close();
      }],
      ['environment restore', () => {
        if (originalWebBaseUrl === undefined) delete process.env.WEB_BASE_URL;
        else process.env.WEB_BASE_URL = originalWebBaseUrl;
        if (originalFontPath === undefined) delete process.env.TRACE_PDF_FONT_PATH;
        else process.env.TRACE_PDF_FONT_PATH = originalFontPath;
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
      }],
    ]);
  }, HOOK_TIMEOUT_MS);

  it('exports selected codes as a valid one-page PDF with safe headers', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4', codeIds: selectedCodeIds })
      .expect(200);
    const bytes = await parsePdfResponseBody(response);
    const document = await PDFDocument.load(bytes);

    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(document.getPageCount()).toBe(1);
    expect(response.headers['content-type']).toMatch(/^application\/pdf/);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''trace-labels-");
    expect(renderer.render).toHaveBeenLastCalledWith(expect.objectContaining({
      codes: selectedCodes.map(({ code }) => ({ code })),
      webBaseUrl: 'https://farm.example.test',
    }));
  });

  it('rejects cross-tenant batch access and mixed code sets without rendering partial PDFs', async () => {
    const before = renderer.render.mock.calls.length;
    await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ paperSize: 'A4' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4', codeIds: [selectedCodeIds[0], foreignCodeId] })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4', codeIds: [selectedCodeIds[0], largeCodeIds[0]] })
      .expect(403);
    expect(renderer.render).toHaveBeenCalledTimes(before);
  });

  it('rejects empty and over-limit all-code batches but allows an explicit set of 500', async () => {
    await request(app.getHttpServer())
      .post(`/api/trace/codes/${emptyBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/trace/codes/${largeBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4' })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post(`/api/trace/codes/${largeBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4', codeIds: largeCodeIds.slice(0, 500) })
      .expect(200);
    const document = await PDFDocument.load(await parsePdfResponseBody(response));
    expect(document.getPageCount()).toBe(24);
  });

  it('rejects invalid schema and layout input with 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ codeIds: [] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'letter' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/trace/codes/${selectedBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4', qrSizeMm: 80 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/trace/codes/${largeBatchId}/labels.pdf`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paperSize: 'A4', codeIds: largeCodeIds })
      .expect(400);
  });
});
