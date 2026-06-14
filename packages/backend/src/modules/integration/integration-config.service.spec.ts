import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { IntegrationConfigService } from './integration-config.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import type { AuthUser } from '@nongchang/shared';

const enc = new EncryptionService('0'.repeat(64));
const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;

function makePrisma() {
  const rows: any[] = [];
  return {
    get rows() { return rows; },
    integrationConfig: {
      findUnique: async ({ where }: any) => {
        if (where.tenantId_provider) {
          return rows.find(r => r.tenantId === where.tenantId_provider.tenantId && r.provider === where.tenantId_provider.provider) ?? null;
        }
        if (where.appId !== undefined) {
          return rows.find(r => r.appId === where.appId) ?? null;
        }
        return null;
      },
      upsert: async ({ where, create, update }: any) => {
        const idx = rows.findIndex(r => r.tenantId === where.tenantId_provider.tenantId && r.provider === where.tenantId_provider.provider);
        if (idx >= 0) { rows[idx] = { ...rows[idx], ...update }; return rows[idx]; }
        const row = { id: 'i' + rows.length, createdAt: new Date(), updatedAt: new Date(), ...create };
        rows.push(row); return row;
      },
    },
  } as any;
}

describe('IntegrationConfigService', () => {
  let prisma: any; let svc: IntegrationConfigService;
  beforeEach(() => { prisma = makePrisma(); svc = new IntegrationConfigService(prisma, enc); });

  it('无配置返回 null', async () => {
    expect(await svc.getView(user, 'wechat')).toBeNull();
  });

  it('微信 upsert 创建并脱敏 secret', async () => {
    const v = await svc.upsertWechat(user, { appId: 'wxAPP', secret: 'SECRET1234' });
    expect(v.appId).toBe('wxAPP');
    expect(v.secretMasked).toBe('****1234');
    expect(prisma.rows[0].secretEnc).not.toContain('SECRET');
  });

  it('微信 upsert secret 为空不改', async () => {
    await svc.upsertWechat(user, { appId: 'wxAPP', secret: 'SECRET1234' });
    const before = prisma.rows[0].secretEnc;
    await svc.upsertWechat(user, { appId: 'wxAPP2' });
    expect(prisma.rows[0].secretEnc).toBe(before);
    expect(prisma.rows[0].appId).toBe('wxAPP2');
  });

  it('微信首次无 secret 抛 BadRequestException', async () => {
    await expect(svc.upsertWechat(user, { appId: 'wxAPP' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('讯飞 upsert 加密 apiKey/apiSecret 并脱敏', async () => {
    const v = await svc.upsertXfyun(user, { appId: 'xf01', apiKey: 'KEY5678', apiSecret: 'SEC9012' });
    expect(v.apiKeyMasked).toBe('****5678');
    expect(v.apiSecretMasked).toBe('****9012');
    expect(prisma.rows[0].apiKeyEnc).not.toContain('KEY5678');
    expect(prisma.rows[0].apiSecretEnc).not.toContain('SEC9012');
  });

  it('findTenantByWechatAppId 反查租户+解密 secret(启用时)', async () => {
    await svc.upsertWechat(user, { appId: 'wxAPP', secret: 'SECRET1234', enabled: true });
    const r = await svc.findTenantByWechatAppId('wxAPP');
    expect(r?.tenantId).toBe('t1');
    expect(r?.secret).toBe('SECRET1234');
  });

  it('findTenantByWechatAppId 未启用返回 null', async () => {
    await svc.upsertWechat(user, { appId: 'wxAPP', secret: 'SECRET1234', enabled: false });
    expect(await svc.findTenantByWechatAppId('wxAPP')).toBeNull();
  });

  it('getEnabled 讯飞解密供内部调用', async () => {
    await svc.upsertXfyun(user, { appId: 'xf01', apiKey: 'KEY5678', apiSecret: 'SEC9012', enabled: true });
    const c = await svc.getEnabledXfyun('t1');
    expect(c).toEqual({ appId: 'xf01', apiKey: 'KEY5678', apiSecret: 'SEC9012' });
  });
});
