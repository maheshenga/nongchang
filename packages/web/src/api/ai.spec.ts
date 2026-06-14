import { describe, it, expect, vi, beforeEach } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { aiChat, aiDiagnose } from './ai';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('ai api client', () => {
  it('aiChat POST /ai/chat 带 message', async () => {
    await aiChat('你好');
    expect(requestMock).toHaveBeenCalledWith('/ai/chat', { method: 'POST', body: JSON.stringify({ message: '你好' }) });
  });
  it('aiDiagnose POST /ai/diagnose 带 input', async () => {
    await aiDiagnose({ imageBase64: 'AAAA', note: '叶斑' });
    expect(requestMock).toHaveBeenCalledWith('/ai/diagnose', { method: 'POST', body: JSON.stringify({ imageBase64: 'AAAA', note: '叶斑' }) });
  });
});
