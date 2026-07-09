import type { AiProviderView, UpdateAiProviderInput } from '@nongchang/shared';

export interface AiProviderRow {
  id: string;
  tenantId: string;
  name: string;
  baseUrl: string;
  apiKeyEnc: string;
  textModel: string;
  visionModel: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnabledAiProvider {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  visionModel: string | null;
}

export function buildAiProviderView(input: { row: AiProviderRow; apiKeyMasked: string }): AiProviderView {
  return {
    id: input.row.id,
    name: input.row.name,
    baseUrl: input.row.baseUrl,
    apiKeyMasked: input.apiKeyMasked,
    textModel: input.row.textModel,
    visionModel: input.row.visionModel ?? null,
    enabled: input.row.enabled,
    createdAt: input.row.createdAt.toISOString(),
    updatedAt: input.row.updatedAt.toISOString(),
  };
}

export function buildAiProviderCreateData(input: {
  tenantId: string;
  name: string;
  baseUrl: string;
  apiKeyEnc: string;
  textModel: string;
  visionModel?: string | null;
  enabled?: boolean;
}) {
  return {
    tenantId: input.tenantId,
    name: input.name,
    baseUrl: input.baseUrl,
    apiKeyEnc: input.apiKeyEnc,
    textModel: input.textModel,
    visionModel: input.visionModel ?? null,
    enabled: input.enabled ?? false,
  };
}

export function buildAiProviderUpdateData(input: {
  dto: UpdateAiProviderInput;
  existingEnabled: boolean;
  apiKeyEnc: string | null;
}): { data: Record<string, unknown>; finalEnabled: boolean } {
  const data: Record<string, unknown> = {};
  if (input.dto.name !== undefined) data.name = input.dto.name;
  if (input.dto.baseUrl !== undefined) data.baseUrl = input.dto.baseUrl;
  if (input.dto.textModel !== undefined) data.textModel = input.dto.textModel;
  if (input.dto.visionModel !== undefined) data.visionModel = input.dto.visionModel ?? null;
  if (input.apiKeyEnc) data.apiKeyEnc = input.apiKeyEnc;

  const finalEnabled = input.dto.enabled ?? input.existingEnabled;
  data.enabled = finalEnabled;
  return { data, finalEnabled };
}

export function findEnabledAiProviderRow(rows: AiProviderRow[]): AiProviderRow | null {
  return rows.find((row) => row.enabled) ?? null;
}

export function buildEnabledAiProvider(input: { row: AiProviderRow; apiKey: string }): EnabledAiProvider {
  return {
    baseUrl: input.row.baseUrl,
    apiKey: input.apiKey,
    textModel: input.row.textModel,
    visionModel: input.row.visionModel ?? null,
  };
}
