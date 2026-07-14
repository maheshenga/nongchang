import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { getLegalSettings, publishLegalSettings, saveLegalSettings } from './legal';

const draft = {
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

const publication = {
  id: '22222222-2222-4222-8222-222222222222',
  privacyVersion: 'privacy-v1',
  agreementVersion: 'agreement-v1',
  effectiveDate: '2026-07-14',
  publishedAt: '2026-07-14T09:00:00.000Z',
};

beforeEach(() => requestMock.mockReset());

describe('legal settings api client', () => {
  it('loads schema-validated tenant legal settings', async () => {
    requestMock.mockResolvedValue({ draft, currentPublication: publication });

    await expect(getLegalSettings()).resolves.toEqual({
      draft,
      currentPublication: publication,
    });
    expect(requestMock).toHaveBeenCalledWith('/legal-settings');
  });

  it('saves the complete plain-text draft with PUT', async () => {
    requestMock.mockResolvedValue({ draft, currentPublication: publication });

    await saveLegalSettings(draft);

    expect(requestMock).toHaveBeenCalledWith('/legal-settings', {
      method: 'PUT',
      body: JSON.stringify(draft),
    });
  });

  it('publishes the saved draft with POST', async () => {
    requestMock.mockResolvedValue(publication);

    await expect(publishLegalSettings()).resolves.toEqual(publication);
    expect(requestMock).toHaveBeenCalledWith('/legal-settings/publish', {
      method: 'POST',
    });
  });

  it('rejects malformed settings responses at the client boundary', async () => {
    requestMock.mockResolvedValue({ draft: { operatorName: 'missing fields' } });

    await expect(getLegalSettings()).rejects.toThrow('Invalid legal.get response');
  });
});
