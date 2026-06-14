import { request } from './request';
import type { QuickTemplateView } from '@nongchang/shared';

// 拉取租户共享的快捷模板列表(小程序只读使用)。
export function listQuickTemplates(): Promise<QuickTemplateView[]> {
  return request<QuickTemplateView[]>({ url: '/quick-templates' });
}
