import { describe, it, expect, vi, beforeEach } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { listAiProviders, createAiProvider, updateAiProvider, deleteAiProvider, testAiProvider } from './ai-provider';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('ai-provider api client', () => {
  it('listAiProviders GET /ai-providers', async () => {
    await listAiProviders();
    expect(requestMock).toHaveBeenCalledWith('/ai-providers');
  });
  it('createAiProvider POST 带 body', async () => {
    const dto = { name: '通义', baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'qwen-plus' };
    await createAiProvider(dto as any);
    expect(requestMock).toHaveBeenCalledWith('/ai-providers', { method: 'POST', body: JSON.stringify(dto) });
  });
  it('updateAiProvider PATCH /ai-providers/:id,id 编码', async () => {
    await updateAiProvider('a b', { name: 'x' } as any);
    expect(requestMock).toHaveBeenCalledWith('/ai-providers/a%20b', { method: 'PATCH', body: JSON.stringify({ name: 'x' }) });
  });
  it('deleteAiProvider DELETE /ai-providers/:id', async () => {
    await deleteAiProvider('a b');
    expect(requestMock).toHaveBeenCalledWith('/ai-providers/a%20b', { method: 'DELETE' });
  });
  it('testAiProvider POST /ai-providers/:id/test', async () => {
    await testAiProvider('p1');
    expect(requestMock).toHaveBeenCalledWith('/ai-providers/p1/test', { method: 'POST' });
  });
});
