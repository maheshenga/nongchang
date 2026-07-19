import { beforeEach, describe, expect, it, vi } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { aiChat, aiDiagnose } from './ai';

beforeEach(() => requestMock.mockReset());

describe('AI API client idempotency', () => {
  it('sends an idempotency key for chat', async () => {
    requestMock.mockResolvedValueOnce({ answer: 'ok' });
    await aiChat('hello');
    expect(requestMock).toHaveBeenCalledWith('/ai/chat', {
      method: 'POST', body: JSON.stringify({ message: 'hello' }),
      headers: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]{16,128}$/) },
    });
  });

  it('sends an idempotency key for diagnosis', async () => {
    requestMock.mockResolvedValueOnce({ result: 'healthy' });
    await aiDiagnose({ imageBase64: 'AAAA', note: 'leaf spot' });
    expect(requestMock).toHaveBeenCalledWith('/ai/diagnose', {
      method: 'POST', body: JSON.stringify({ imageBase64: 'AAAA', note: 'leaf spot' }),
      headers: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]{16,128}$/) },
    });
  });
});
