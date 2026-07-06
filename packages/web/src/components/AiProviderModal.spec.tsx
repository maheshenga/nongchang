import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AiProviderView } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAiProviderMock = vi.fn();
const updateAiProviderMock = vi.fn();

vi.mock('../api/ai-provider', () => ({
  createAiProvider: (...args: unknown[]) => createAiProviderMock(...args),
  updateAiProvider: (...args: unknown[]) => updateAiProviderMock(...args),
}));

import AiProviderModal from './AiProviderModal';

const existingProvider: AiProviderView = {
  id: 'provider-1',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyMasked: 'sk-***',
  textModel: 'gpt-4o-mini',
  visionModel: 'gpt-4o',
  enabled: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  createAiProviderMock.mockResolvedValue(existingProvider);
  updateAiProviderMock.mockResolvedValue(existingProvider);
});

describe('AiProviderModal DTO behavior', () => {
  it('creates a provider with the submitted fields and enabled state', async () => {
    const onSaved = vi.fn();
    render(<AiProviderModal provider={null} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Azure OpenAI' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://azure.example.com/openai' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret-key' } });
    fireEvent.change(screen.getByLabelText('文本模型'), { target: { value: 'gpt-4.1-mini' } });
    fireEvent.change(screen.getByLabelText('视觉模型（可选）'), { target: { value: 'gpt-4.1-vision' } });
    fireEvent.click(screen.getByLabelText('启用该服务商（同租户仅允许一个启用）'));
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createAiProviderMock).toHaveBeenCalledWith({
        name: 'Azure OpenAI',
        baseUrl: 'https://azure.example.com/openai',
        apiKey: 'secret-key',
        textModel: 'gpt-4.1-mini',
        visionModel: 'gpt-4.1-vision',
        enabled: true,
      });
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('updates a provider without sending a blank API key and normalizes blank vision model', async () => {
    const onSaved = vi.fn();
    render(<AiProviderModal provider={existingProvider} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('视觉模型（可选）'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(updateAiProviderMock).toHaveBeenCalledWith('provider-1', {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        textModel: 'gpt-4o-mini',
        visionModel: undefined,
        enabled: true,
      });
    });
    const dto = updateAiProviderMock.mock.calls[0][1] as Record<string, unknown>;
    expect(dto.apiKey).toBeUndefined();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('shows API errors without reporting a saved provider', async () => {
    createAiProviderMock.mockRejectedValue(new Error('provider save failed'));
    const onSaved = vi.fn();
    render(<AiProviderModal provider={null} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Broken Provider' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://broken.example.com/v1' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret-key' } });
    fireEvent.change(screen.getByLabelText('文本模型'), { target: { value: 'broken-model' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByText('provider save failed')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
