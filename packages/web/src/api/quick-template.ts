import { okResponseSchema, quickTemplateViewSchema, type QuickTemplateInput, type QuickTemplateView } from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function listQuickTemplates(): Promise<QuickTemplateView[]> {
  return parseResponse(quickTemplateViewSchema.array(), await request<unknown>('/quick-templates'), 'quickTemplate.list');
}
export async function createQuickTemplate(input: QuickTemplateInput): Promise<QuickTemplateView> {
  return parseResponse(quickTemplateViewSchema, await request<unknown>('/quick-templates', {
    method: 'POST', body: JSON.stringify(input),
  }), 'quickTemplate.create');
}
export async function updateQuickTemplate(id: string, input: QuickTemplateInput): Promise<QuickTemplateView> {
  return parseResponse(quickTemplateViewSchema, await request<unknown>(`/quick-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  }), 'quickTemplate.update');
}
export async function deleteQuickTemplate(id: string): Promise<{ ok: true }> {
  return parseResponse(okResponseSchema, await request<unknown>(`/quick-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }), 'quickTemplate.delete');
}
