import type { QuickTemplateView, QuickTemplateInput } from '@nongchang/shared';
import { request } from './request';

export function listQuickTemplates(): Promise<QuickTemplateView[]> {
  return request<QuickTemplateView[]>('/quick-templates');
}
export function createQuickTemplate(input: QuickTemplateInput): Promise<QuickTemplateView> {
  return request<QuickTemplateView>('/quick-templates', { method: 'POST', body: JSON.stringify(input) });
}
export function updateQuickTemplate(id: string, input: QuickTemplateInput): Promise<QuickTemplateView> {
  return request<QuickTemplateView>(`/quick-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteQuickTemplate(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/quick-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
