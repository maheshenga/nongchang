import 'reflect-metadata';
import { HttpStatus, StreamableFile } from '@nestjs/common';
import { HEADERS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { Permission, Role, traceLabelPdfInputSchema, type AuthUser } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TraceController } from './trace.controller';

describe('TraceController authorization metadata', () => {
  const readRoles = [Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT];

  it.each(['listCodes', 'listEvents', 'createLabelPdf'] as const)(
    'requires trace:view permission and explicit supported roles for %s',
    (methodName) => {
      const handler = TraceController.prototype[methodName];

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(readRoles);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.TRACE_VIEW]);
    },
  );

  it.each(['genCode', 'addEvent'] as const)('does not require explicit permissions for %s in this phase', (methodName) => {
    const handler = TraceController.prototype[methodName];

    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
  });

  it('returns label PDFs with HTTP 200 and private no-store response metadata', async () => {
    const labelPdf = {
      create: vi.fn().mockResolvedValue({
        bytes: new Uint8Array(Buffer.from('%PDF-test')),
        fileName: 'trace-labels-BATCH-001.pdf',
        labelCount: 1,
        pageCount: 1,
      }),
    };
    const controller = new TraceController({} as never, labelPdf as never);
    const user: AuthUser = {
      userId: 'user-1', tenantId: 'tenant-1', role: Role.MERCHANT, ownerId: 'owner-1', agentId: null,
    };
    const input = traceLabelPdfInputSchema.parse({ paperSize: 'A4' });

    const result = await controller.createLabelPdf(user, 'batch-1', input);
    const handler = TraceController.prototype.createLabelPdf;

    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: expect.stringContaining("filename*=UTF-8''trace-labels-BATCH-001.pdf"),
    });
    expect(labelPdf.create).toHaveBeenCalledWith(user, 'batch-1', input);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });
});
