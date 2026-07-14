import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogHost } from '../hooks/useDialog';

const api = vi.hoisted(() => ({
  getLegalSettings: vi.fn(),
  saveLegalSettings: vi.fn(),
  publishLegalSettings: vi.fn(),
}));

vi.mock('../api/legal', () => api);

import LegalSettings from './LegalSettings';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'LegalSettings.tsx');

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

beforeEach(() => {
  vi.clearAllMocks();
  api.getLegalSettings.mockResolvedValue({ draft, currentPublication: publication });
  api.saveLegalSettings.mockImplementation(async (input) => ({
    draft: input,
    currentPublication: publication,
  }));
  api.publishLegalSettings.mockResolvedValue(publication);
});

describe('LegalSettings', () => {
  it('keeps both legal bodies in plain-text textarea controls', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source.match(/<textarea/g)).toHaveLength(2);
    expect(source).toContain('fluentButton');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
  });

  it('loads a draft, keeps publication visible, saves plain text, and confirms publish', async () => {
    render(<><LegalSettings /><DialogHost /></>);

    expect(await screen.findByDisplayValue('示例农业科技有限公司')).toBeTruthy();
    expect(screen.getByText('当前已发布：privacy-v1 / agreement-v1')).toBeTruthy();

    const plainText = '<script>alert(1)</script>' + '隐私政策'.repeat(80);
    fireEvent.change(screen.getByLabelText('隐私政策正文'), {
      target: { value: plainText },
    });
    expect(document.querySelector('script')).toBeNull();
    expect((screen.getByRole('button', { name: '发布当前草稿' }) as HTMLButtonElement).disabled)
      .toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(api.saveLegalSettings).toHaveBeenCalledWith({
      ...draft,
      privacyPolicyText: plainText,
    }));
    expect((screen.getByRole('button', { name: '发布当前草稿' }) as HTMLButtonElement).disabled)
      .toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '发布当前草稿' }));
    expect(api.publishLegalSettings).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: '发布法律协议' });
    expect(within(dialog).getByText(/privacy-v1.*agreement-v1/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(api.publishLegalSettings).toHaveBeenCalledTimes(1));
  });

  it('rejects invalid drafts before calling the save API', async () => {
    render(<LegalSettings />);
    await screen.findByDisplayValue('示例农业科技有限公司');

    fireEvent.change(screen.getByLabelText('隐私政策正文'), {
      target: { value: '过短' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(api.saveLegalSettings).not.toHaveBeenCalled();
  });
});
