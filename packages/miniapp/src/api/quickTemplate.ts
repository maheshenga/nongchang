import { quickTemplateViewSchema, type QuickTemplateView } from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function listQuickTemplates(): Promise<QuickTemplateView[]> {
  return parseResponse(quickTemplateViewSchema.array(), await request<unknown>({ url: '/quick-templates' }), 'quickTemplate.list');
}
