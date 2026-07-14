import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LegalDraftPreview from './LegalDraftPreview';

const draft = {
  operatorName: '示例农业科技有限公司',
  contactAddress: '杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-v2',
  agreementVersion: 'agreement-v2',
  effectiveDate: '2026-07-15',
  privacyPolicyText: '<script>alert(1)</script>\n隐私政策正文',
  userAgreementText: '用户协议正文',
};

const currentPublication = {
  id: '22222222-2222-4222-8222-222222222222',
  privacyVersion: 'privacy-v1',
  agreementVersion: 'agreement-v1',
  effectiveDate: '2026-07-14',
  publishedAt: '2026-07-14T09:00:00.000Z',
};

describe('LegalDraftPreview', () => {
  it('renders draft metadata and both legal bodies as escaped plain text', () => {
    render(<LegalDraftPreview draft={draft} currentPublication={currentPublication} />);

    expect(screen.getByRole('region', { name: '法律草稿预览' })).toBeTruthy();
    expect(screen.getByText('未发布草稿')).toBeTruthy();
    expect(screen.getByText('示例农业科技有限公司')).toBeTruthy();
    expect(screen.getByText('privacy-v2 / agreement-v2')).toBeTruthy();
    expect(screen.getByText('2026-07-15')).toBeTruthy();
    expect(screen.getByText('<script>alert(1)</script>', { exact: false })).toBeTruthy();
    expect(screen.getByText('用户协议正文')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });

  it('identifies a draft matching the current publication', () => {
    render(<LegalDraftPreview
      draft={{
        ...draft,
        privacyVersion: currentPublication.privacyVersion,
        agreementVersion: currentPublication.agreementVersion,
        effectiveDate: currentPublication.effectiveDate,
      }}
      currentPublication={currentPublication}
    />);

    expect(screen.getByText('草稿版本信息与当前发布一致')).toBeTruthy();
    expect(screen.getByText('当前已发布：privacy-v1 / agreement-v1')).toBeTruthy();
  });
});
