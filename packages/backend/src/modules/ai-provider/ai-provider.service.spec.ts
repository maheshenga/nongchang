import { describe, it, expect, beforeEach } from 'vitest';
import { AiProviderService } from './ai-provider.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import type { AuthUser } from '@nongchang/shared';

const enc = new EncryptionService('0'.repeat(64));
const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;

function makePrisma() {
  const rows: any[] = [];
  return {
    rows,
    aiProvider: {
      create: async ({ data }: any) => { const r = { id: 'p' + (rows.length + 1), createdAt: new Date(), updatedAt: new Date(), visionModel: null, ...data }; rows.push(r); return r; },
      findMany: async ({ where }: any) => rows.filter(r => r.tenantId === where.tenantId),
      findFirst: async ({ where }: any) => rows.find(r => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      update: async ({ where, data }: any) => { const r = rows.find(x => x.id === where.id); Object.assign(r, data); return r; },
      updateMany: async ({ where, data }: any) => { rows.filter(r => r.tenantId === where.tenantId).forEach(r => Object.assign(r, data)); return { count: 0 }; },
      delete: async ({ where }: any) => { const i = rows.findIndex(r => r.id === where.id); rows.splice(i, 1); return {}; },
    },
    $transaction: async (fn: any) => fn(),
  } as any;
}

describe('AiProviderService', () => {
  let prisma: any; let svc: AiProviderService;
  beforeEach(() => { prisma = makePrisma(); svc = new AiProviderService(prisma, enc); });

  it('create 加密存储且 view 脱敏', async () => {
    const v = await svc.create(user, { name: '通义', baseUrl: 'https://x.com/v1', apiKey: 'sk-abcd1234', textModel: 'qwen-plus' });
    expect(v.apiKeyMasked).toBe('****1234');
    expect((v as any).apiKey).toBeUndefined();
    expect(prisma.rows[0].apiKeyEnc).not.toContain('sk-abcd');
  });

  it('list 仅本租户', async () => {
    await svc.create(user, { name: 'a', baseUrl: 'https://x.com/v1', apiKey: 'sk-1111', textModel: 'm' });
    prisma.rows.push({ id: 'pX', tenantId: 't2', name: 'other', baseUrl: '', apiKeyEnc: enc.encrypt('sk-2222'), textModel: 'm', visionModel: null, enabled: false, createdAt: new Date(), updatedAt: new Date() });
    const list = await svc.list(user);
    expect(list).toHaveLength(1);
  });

  it('enable 唯一: 启用新的会置反其他', async () => {
    const a = await svc.create(user, { name: 'a', baseUrl: 'https://x.com/v1', apiKey: 'sk-1111', textModel: 'm', enabled: true });
    await svc.create(user, { name: 'b', baseUrl: 'https://x.com/v1', apiKey: 'sk-2222', textModel: 'm', enabled: true });
    const reloaded = prisma.rows.find((r: any) => r.id === a.id);
    expect(reloaded.enabled).toBe(false);
  });

  it('update apiKey 为空则不改密钥', async () => {
    const a = await svc.create(user, { name: 'a', baseUrl: 'https://x.com/v1', apiKey: 'sk-keep9999', textModel: 'm' });
    const before = prisma.rows.find((r: any) => r.id === a.id).apiKeyEnc;
    const v = await svc.update(user, a.id, { name: 'a2' });
    expect(prisma.rows.find((r: any) => r.id === a.id).apiKeyEnc).toBe(before);
    expect(v.name).toBe('a2');
  });
});
