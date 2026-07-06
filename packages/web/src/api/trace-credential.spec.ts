import { describe, expect, it, vi } from 'vitest';
import { uploadCredentialFile } from './trace-credential';
import { request } from './request';

vi.mock('./request', () => ({
  request: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/credentials/report.pdf' }),
}));

describe('trace credential API', () => {
  it('uploads credential files with credential purpose', async () => {
    const file = new File(['%PDF-1.7\n'], 'report.pdf', { type: 'application/pdf' });

    const url = await uploadCredentialFile(file);

    expect(url).toBe('https://cdn.example.com/credentials/report.pdf');
    expect(request).toHaveBeenCalledWith('/uploads?purpose=credential', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });
});
