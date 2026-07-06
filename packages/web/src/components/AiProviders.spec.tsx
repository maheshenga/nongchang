import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AiProviderView } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAiProvidersMock = vi.fn();
const updateAiProviderMock = vi.fn();
const deleteAiProviderMock = vi.fn();
const testAiProviderMock = vi.fn();

vi.mock('../api/ai-provider', () => ({
  listAiProviders: () => listAiProvidersMock(),
  updateAiProvider: (...args: unknown[]) => updateAiProviderMock(...args),
  deleteAiProvider: (...args: unknown[]) => deleteAiProviderMock(...args),
  testAiProvider: (...args: unknown[]) => testAiProviderMock(...args),
}));

vi.mock('./AiProviderModal', () => ({
  default: ({ provider, onClose }: { provider: AiProviderView | null; onClose: () => void }) => (
    <div role="dialog" aria-label="AI provider modal">
      {provider ? `editing ${provider.name}` : 'creating provider'}
      <button type="button" onClick={onClose}>close modal</button>
    </div>
  ),
}));

vi.mock('./AiPlayground', () => ({ default: () => <div>ai-playground-real-child</div> }));

import AiProviders from './AiProviders';

const providers: AiProviderView[] = [
  {
    id: 'provider-1',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: 'sk-***',
    textModel: 'gpt-4o-mini',
    visionModel: null,
    enabled: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listAiProvidersMock.mockResolvedValue(providers);
  updateAiProviderMock.mockResolvedValue({ ...providers[0], enabled: false });
  deleteAiProviderMock.mockResolvedValue({ ok: true });
  testAiProviderMock.mockResolvedValue({ ok: true, latencyMs: 42 });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

describe('AiProviders Fluent settings', () => {
  it('renders provider table and child playground slot', async () => {
    render(<AiProviders />);
    await screen.findByText('OpenAI');

    expect(screen.getByRole('heading', { name: 'AI 服务商管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增服务商' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '编辑 OpenAI' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeTruthy();
    expect(screen.getByText('-')).toBeTruthy();
    expect(screen.getByText('ai-playground-real-child')).toBeTruthy();
  });

  it('shows empty state and opens the create modal', async () => {
    listAiProvidersMock.mockResolvedValue([]);
    render(<AiProviders />);

    expect(await screen.findByText('暂无 AI 服务商，点击右上角新增。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新增服务商' }));
    expect(screen.getByRole('dialog', { name: 'AI provider modal' }).textContent).toContain('creating provider');
  });

  it('toggles provider enabled state through the real update API', async () => {
    render(<AiProviders />);
    await screen.findByText('OpenAI');

    fireEvent.click(screen.getByRole('button', { name: '停用 OpenAI' }));

    await waitFor(() => {
      expect(updateAiProviderMock).toHaveBeenCalledWith('provider-1', { enabled: false });
    });
  });

  it('confirms delete and calls the real delete API', async () => {
    render(<AiProviders />);
    await screen.findByText('OpenAI');

    fireEvent.click(screen.getByRole('button', { name: '删除 OpenAI' }));

    expect(window.confirm).toHaveBeenCalledWith('确定删除该 AI 服务商？此操作不可撤销。');
    await waitFor(() => {
      expect(deleteAiProviderMock).toHaveBeenCalledWith('provider-1');
    });
  });

  it('shows provider test progress and success result', async () => {
    render(<AiProviders />);
    await screen.findByText('OpenAI');

    fireEvent.click(screen.getByRole('button', { name: '测试 OpenAI' }));

    expect(screen.getByText('测试中...')).toBeTruthy();
    expect(await screen.findByText('连接正常 42ms')).toBeTruthy();
  });
});
