import { z } from 'zod';

export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

export const idResponseSchema = z.object({ id: z.string() });
export type IdResponse = z.infer<typeof idResponseSchema>;

export const pendingResponseSchema = z.object({ status: z.literal('pending') });
export type PendingResponse = z.infer<typeof pendingResponseSchema>;

export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}
