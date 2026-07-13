import { z } from 'zod';

// 通用列表分页查询:page/pageSize 均为可选。
// 向后兼容契约(见 list 类 service):
//   - 两者都不传  → service 返回裸数组(带默认安全上限 take,防无界结果集),不破坏既有消费端。
//   - 传了任一项  → service 返回分页信封 { items, total, page, pageSize }。
// query string 全为字符串,用 coerce 转数字;pageSize 上限 200 防一次拉过多。
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

// 分页信封:与既有 PaginatedFarmRecords/PaginatedLedger/PaginatedOrders 形状一致。
export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

// 是否请求了分页(传了 page 或 pageSize 之一即视为分页模式)。
export function isPaginated(q?: ListQuery | null): q is ListQuery {
  return !!q && (q.page !== undefined || q.pageSize !== undefined);
}
