import {
  legalPublicationSummarySchema,
  legalSettingsViewSchema,
  type LegalDocumentPayload,
  type LegalPublicationSummary,
  type LegalSettingsView,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getLegalSettings(): Promise<LegalSettingsView> {
  return parseResponse(
    legalSettingsViewSchema,
    await request<unknown>('/legal-settings'),
    'legal.get',
  );
}

export async function saveLegalSettings(
  input: LegalDocumentPayload,
): Promise<LegalSettingsView> {
  return parseResponse(
    legalSettingsViewSchema,
    await request<unknown>('/legal-settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
    'legal.save',
  );
}

export async function publishLegalSettings(): Promise<LegalPublicationSummary> {
  return parseResponse(
    legalPublicationSummarySchema,
    await request<unknown>('/legal-settings/publish', { method: 'POST' }),
    'legal.publish',
  );
}
