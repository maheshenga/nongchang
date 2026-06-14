import { describe, it, expect, beforeEach } from 'vitest';
import { OssConfigService } from './oss-config.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import type { AuthUser } from '@nongchang/shared';

const enc = new EncryptionService('0'.repeat(64));
const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;

function makePrisma() {
  let row: any = null;
  return {
    get row() { return row; },
    ossConfig: {
      findUnique: async ({ where }: any) => (row && row.tenantId === where.tenantId ? row : null),
      upsert: async ({ create, update }: any) => { row = row ? { ...row, ...update } : { id: 'o1', ...create }; return row; },
    },
  } as any;
}

describe('OssConfigService', () => {
  let prisma: any; let svc: OssConfigService;
  beforeEach(() => { prisma = makePrisma(); svc = new OssConfigService(prisma, enc); });

  it('无配置返回 null', async () => {
    expect(await svc.get(user)).toBeNull();
  });

  it('upsert 创建并脱敏', async () => {
    const v = await svc.upsert(user, { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'SECRET1234' });
    expect(v.accessKeySecretMasked).toBe('****1234');
    expect(prisma.row.accessKeySecEnc).not.toContain('SECRET');
  });

  it('upsert secret 为空不改', async () => {
    await svc.upsert(user, { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'SECRET1234' });
    const before = prisma.row.accessKeySecEnc;
    await svc.upsert(user, { region: 'cn2', bucket: 'b', accessKeyId: 'AK' });
    expect(prisma.row.accessKeySecEnc).toBe(before);
    expect(prisma.row.region).toBe('cn2');
  });

  it('getCredentials 解密(启用时)', async () => {
    await svc.upsert(user, { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'SECRET1234', enabled: true });
    const c = await svc.getCredentials('t1');
    expect(c?.accessKeySecret).toBe('SECRET1234');
  });
});
