import { describe, it, expect, vi } from 'vitest';
import { TraceCredentialService } from './trace-credential.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser, type CreateTraceCredentialInput } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const input: CreateTraceCredentialInput = {
  batchId: 'b1', type: 'certificate', title: '有机认证证书', issuer: '国家认证中心',
  serialNo: 'OC-2026-001', issuedAt: '2026-06-01T00:00:00.000Z', fileUrl: 'https://oss.example.com/cert.pdf',
};

function make(batchInScope = true, credInScope = true) {
  const prisma = {
    batch: { findFirst: vi.fn().mockResolvedValue(batchInScope ? { id: 'b1' } : null) },
    traceCredential: {
      create: vi.fn().mockResolvedValue({
        id: 'cr1', tenantId: 't1', batchId: 'b1', type: 'certificate', title: '有机认证证书',
        issuer: '国家认证中心', serialNo: 'OC-2026-001', issuedAt: new Date('2026-06-01T00:00:00.000Z'),
        fileUrl: 'https://oss.example.com/cert.pdf', createdAt: new Date('2026-06-15T00:00:00.000Z'),
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(credInScope ? { id: 'cr1', batchId: 'b1' } : null),
      delete: vi.fn().mockResolvedValue({ id: 'cr1' }),
    },
    ossConfig: { findUnique: vi.fn().mockResolvedValue({ enabled: true, baseUrl: 'https://oss.example.com/uploads' }) },
  };
  return { svc: new TraceCredentialService(prisma as any, new ScopeService()), prisma };
}

describe('TraceCredentialService', () => {
  it('create:batch 在范围内则创建并返回视图', async () => {
    const h = make(true);
    const out = await h.svc.create(merchant, input);
    expect(h.prisma.traceCredential.create).toHaveBeenCalled();
    expect(out.id).toBe('cr1');
    expect(out.type).toBe('certificate');
    expect(out.issuedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('create:batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.create(merchant, input)).rejects.toThrow();
    expect(h.prisma.traceCredential.create).not.toHaveBeenCalled();
  });

  it('create: rejects credential file urls outside the trusted OSS base url', async () => {
    const h = make(true);
    h.prisma.ossConfig = {
      findUnique: vi.fn().mockResolvedValue({ enabled: true, baseUrl: 'https://cdn.example.com/uploads' }),
    };

    await expect(h.svc.create(merchant, { ...input, fileUrl: 'https://evil.example/cert.pdf' }))
      .rejects.toThrow();
    expect(h.prisma.traceCredential.create).not.toHaveBeenCalled();
  });

  it('create: rejects external credential file urls when no trusted storage origin is configured', async () => {
    const previousBaseUrl = process.env.OSS_BASE_URL;
    delete process.env.OSS_BASE_URL;
    const h = make(true);
    h.prisma.ossConfig.findUnique.mockResolvedValueOnce(null);

    try {
      await expect(h.svc.create(merchant, { ...input, fileUrl: 'https://evil.example/cert.pdf' }))
        .rejects.toThrow();
      expect(h.prisma.traceCredential.create).not.toHaveBeenCalled();
    } finally {
      if (previousBaseUrl === undefined) delete process.env.OSS_BASE_URL;
      else process.env.OSS_BASE_URL = previousBaseUrl;
    }
  });

  it('list:batch 在范围内查询并返回视图列表', async () => {
    const h = make(true);
    h.prisma.traceCredential.findMany.mockResolvedValueOnce([{
      id: 'cr1', batchId: 'b1', type: 'report', title: '农残检测报告', issuer: 'SGS',
      serialNo: null, issuedAt: null, fileUrl: 'https://oss.example.com/r.pdf', createdAt: new Date(),
    }]);
    const out = await h.svc.list(merchant, 'b1');
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('report');
    expect(out[0].serialNo).toBeNull();
    expect(out[0].issuedAt).toBeNull();
  });

  it('list:batch 不在范围则抛 Forbidden(不查询)', async () => {
    const h = make(false);
    await expect(h.svc.list(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceCredential.findMany).not.toHaveBeenCalled();
  });

  it('remove:作用域内删除', async () => {
    const h = make(true, true);
    await h.svc.remove(merchant, 'cr1');
    expect(h.prisma.traceCredential.delete).toHaveBeenCalledWith({ where: { id: 'cr1' } });
  });

  it('remove:不在范围则抛 Forbidden(不删除)', async () => {
    const h = make(true, false);
    await expect(h.svc.remove(merchant, 'cr1')).rejects.toThrow();
    expect(h.prisma.traceCredential.delete).not.toHaveBeenCalled();
  });
});
