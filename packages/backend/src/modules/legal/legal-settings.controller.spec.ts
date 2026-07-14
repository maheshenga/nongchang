import { describe, expect, it, vi } from 'vitest';
import { Role, type AuthUser, type LegalDocumentPayload } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { LegalSettingsController } from './legal-settings.controller';

const systemAdmin: AuthUser = {
  userId: 'admin-1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

const draft: LegalDocumentPayload = {
  operatorName: '示例农业科技有限公司',
  contactAddress: '杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-v1',
  agreementVersion: 'agreement-v1',
  effectiveDate: '2026-07-14',
  privacyPolicyText: '隐私政策正文'.repeat(80),
  userAgreementText: '用户协议正文'.repeat(80),
};

describe('LegalSettingsController', () => {
  it('restricts every legal settings route to system_admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LegalSettingsController)).toEqual([
      Role.SYSTEM_ADMIN,
    ]);
  });

  it('passes the authenticated tenant actor through every operation', async () => {
    const legal = {
      getSettings: vi.fn().mockResolvedValue({ draft: null, currentPublication: null }),
      saveDraft: vi.fn().mockResolvedValue({ draft, currentPublication: null }),
      publish: vi.fn().mockResolvedValue({ id: 'publication-1' }),
    };
    const controller = new LegalSettingsController(legal as never);

    await expect(controller.get(systemAdmin)).resolves.toEqual({
      draft: null,
      currentPublication: null,
    });
    await expect(controller.save(systemAdmin, draft)).resolves.toEqual({
      draft,
      currentPublication: null,
    });
    await expect(controller.publish(systemAdmin)).resolves.toEqual({ id: 'publication-1' });
    expect(legal.getSettings).toHaveBeenCalledWith(systemAdmin);
    expect(legal.saveDraft).toHaveBeenCalledWith(systemAdmin, draft);
    expect(legal.publish).toHaveBeenCalledWith(systemAdmin);
  });
});
