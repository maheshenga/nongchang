import { describe, expect, it } from 'vitest';
import {
  buildAiProviderCreateData,
  buildAiProviderUpdateData,
  buildAiProviderView,
  buildEnabledAiProvider,
  findEnabledAiProviderRow,
  type AiProviderRow,
} from './ai-provider.model';

describe('ai provider model helpers', () => {
  const baseRow: AiProviderRow = {
    id: 'p1',
    tenantId: 't1',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnc: 'ENC(api-key)',
    textModel: 'qwen-plus',
    visionModel: null,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('projects AI provider views with masked API key supplied by service', () => {
    expect(buildAiProviderView({ row: baseRow, apiKeyMasked: '****1234' })).toEqual({
      id: 'p1',
      name: 'Qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKeyMasked: '****1234',
      textModel: 'qwen-plus',
      visionModel: null,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('builds create data with default disabled state and null vision model', () => {
    expect(buildAiProviderCreateData({
      tenantId: 't1',
      name: 'Qwen',
      baseUrl: 'https://example.com/v1',
      apiKeyEnc: 'ENC(key)',
      textModel: 'qwen-plus',
    })).toEqual({
      tenantId: 't1',
      name: 'Qwen',
      baseUrl: 'https://example.com/v1',
      apiKeyEnc: 'ENC(key)',
      textModel: 'qwen-plus',
      visionModel: null,
      enabled: false,
    });

    expect(buildAiProviderCreateData({
      tenantId: 't1',
      name: 'Qwen Vision',
      baseUrl: 'https://example.com/v1',
      apiKeyEnc: 'ENC(key)',
      textModel: 'qwen-plus',
      visionModel: 'qwen-vl-plus',
      enabled: true,
    }).enabled).toBe(true);
  });

  it('builds sparse update data and preserves existing enabled by default', () => {
    expect(buildAiProviderUpdateData({
      dto: { name: 'Updated', visionModel: undefined },
      existingEnabled: true,
      apiKeyEnc: null,
    })).toEqual({
      finalEnabled: true,
      data: { name: 'Updated', enabled: true },
    });

    expect(buildAiProviderUpdateData({
      dto: {
        baseUrl: 'https://new.example.com/v1',
        textModel: 'deepseek-chat',
        visionModel: null,
        enabled: false,
        apiKey: 'new-key',
      },
      existingEnabled: true,
      apiKeyEnc: 'ENC(new-key)',
    })).toEqual({
      finalEnabled: false,
      data: {
        baseUrl: 'https://new.example.com/v1',
        textModel: 'deepseek-chat',
        visionModel: null,
        apiKeyEnc: 'ENC(new-key)',
        enabled: false,
      },
    });
  });

  it('selects first enabled provider row and projects decrypted credentials', () => {
    expect(findEnabledAiProviderRow([])).toBeNull();
    expect(findEnabledAiProviderRow([{ ...baseRow, enabled: false }])).toBeNull();
    expect(findEnabledAiProviderRow([{ ...baseRow, id: 'disabled', enabled: false }, baseRow])).toBe(baseRow);

    expect(buildEnabledAiProvider({ row: baseRow, apiKey: 'plain-key' })).toEqual({
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'plain-key',
      textModel: 'qwen-plus',
      visionModel: null,
    });
  });
});
