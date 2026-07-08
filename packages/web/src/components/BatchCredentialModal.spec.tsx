import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchCredentialModal from './BatchCredentialModal';

const credentialMocks = vi.hoisted(() => ({
  listCredentials: vi.fn(),
  createCredential: vi.fn(),
  removeCredential: vi.fn(),
  uploadCredentialFile: vi.fn(),
}));

vi.mock('../api/trace-credential', () => credentialMocks);

const source = () => readFileSync(join(process.cwd(), 'src/components/BatchCredentialModal.tsx'), 'utf8');

function latestButton(container: HTMLElement): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.at(-1);
  if (!button) throw new Error('button not found');
  return button;
}

describe('BatchCredentialModal Fluent credential evidence surface', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    credentialMocks.listCredentials.mockResolvedValue([
      {
        id: 'cred-1',
        batchId: 'batch-1',
        type: 'certificate',
        title: 'Organic Cert',
        issuer: 'Certification Agency',
        serialNo: 'CERT-001',
        issuedAt: '2026-07-01T00:00:00.000Z',
        fileUrl: 'https://cdn.example.test/cert.pdf',
        createdAt: '2026-07-02T00:00:00.000Z',
      },
    ]);
    credentialMocks.createCredential.mockResolvedValue({ id: 'cred-2' });
    credentialMocks.removeCredential.mockResolvedValue({ id: 'cred-1' });
    credentialMocks.uploadCredentialFile.mockResolvedValue('https://cdn.example.test/report.pdf');
  });

  it('uses shared Fluent primitives and excludes fake credential output paths', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).toContain('fluentButton');
    expect(text).toContain('fluentInput');
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('bg-emerald-600');
    expect(text).not.toContain('hover:bg-emerald-700');
    expect(text).not.toContain('border-slate');
    expect(text).not.toContain('text-slate');
    expect(text).not.toContain('bg-slate');
    expect(text).not.toContain('mockResult');
    expect(text).not.toContain('Simulate');
    expect(text).not.toContain('fake');
    expect(text).not.toContain('setTimeout(() =>');
  });

  it('loads and renders real credentials with file links', async () => {
    render(<BatchCredentialModal batchId="batch-1" batchLabel="B-001" onClose={onClose} />);

    await waitFor(() => expect(credentialMocks.listCredentials).toHaveBeenCalledWith('batch-1'));
    expect(await screen.findByText('Organic Cert')).toBeTruthy();
    expect(screen.getByText(/Certification Agency/)).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://cdn.example.test/cert.pdf');
  });

  it('shows a Fluent empty state when no credentials exist', async () => {
    credentialMocks.listCredentials.mockResolvedValue([]);

    render(<BatchCredentialModal batchId="batch-empty" batchLabel="B-EMPTY" onClose={onClose} />);

    expect(await screen.findByRole('status', { name: '暂未关联任何资质或检测文件' })).toBeTruthy();
  });

  it('shows a retryable error state when credential loading fails', async () => {
    credentialMocks.listCredentials
      .mockRejectedValueOnce(new Error('credential-load-error'))
      .mockResolvedValueOnce([]);

    render(<BatchCredentialModal batchId="batch-error" batchLabel="B-ERR" onClose={onClose} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('credential-load-error');

    const retry = alert.querySelector('button');
    expect(retry).toBeTruthy();
    fireEvent.click(retry as HTMLButtonElement);

    await waitFor(() => expect(credentialMocks.listCredentials).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status', { name: '暂未关联任何资质或检测文件' })).toBeTruthy();
  });

  it('uploads a credential file before creating the credential record', async () => {
    const { container } = render(<BatchCredentialModal batchId="batch-1" batchLabel="B-001" onClose={onClose} />);

    fireEvent.click(await waitFor(() => latestButton(container)));

    const select = container.querySelector('select');
    const inputs = Array.from(container.querySelectorAll('input'));
    const title = inputs.find((input) => input.type === 'text');
    const issuer = inputs.filter((input) => input.type === 'text')[1];
    const serialNo = inputs.filter((input) => input.type === 'text')[2];
    const issuedAt = inputs.find((input) => input.type === 'date');
    const fileInput = inputs.find((input) => input.type === 'file');
    if (!select || !title || !issuer || !serialNo || !issuedAt || !fileInput) throw new Error('form controls not found');

    fireEvent.change(select, { target: { value: 'report' } });
    fireEvent.change(title, { target: { value: 'Residue Report' } });
    fireEvent.change(issuer, { target: { value: 'Testing Center' } });
    fireEvent.change(serialNo, { target: { value: 'R-001' } });
    fireEvent.change(issuedAt, { target: { value: '2026-07-09' } });

    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(credentialMocks.uploadCredentialFile).toHaveBeenCalledWith(file));
    const submit = container.querySelector('button[type="submit"]');
    if (!submit) throw new Error('submit button not found');
    fireEvent.click(submit);

    await waitFor(() => expect(credentialMocks.createCredential).toHaveBeenCalledWith({
      batchId: 'batch-1',
      type: 'report',
      title: 'Residue Report',
      issuer: 'Testing Center',
      serialNo: 'R-001',
      issuedAt: new Date('2026-07-09').toISOString(),
      fileUrl: 'https://cdn.example.test/report.pdf',
    }));
    await waitFor(() => expect(credentialMocks.listCredentials).toHaveBeenCalledTimes(2));
  });

  it('deletes credentials through the real delete API and reloads the list', async () => {
    render(<BatchCredentialModal batchId="batch-1" batchLabel="B-001" onClose={onClose} />);

    await screen.findByText('Organic Cert');
    fireEvent.click(screen.getByRole('button', { name: /Organic Cert/ }));

    await waitFor(() => expect(credentialMocks.removeCredential).toHaveBeenCalledWith('cred-1'));
    await waitFor(() => expect(credentialMocks.listCredentials).toHaveBeenCalledTimes(2));
  });
});
