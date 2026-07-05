import { z } from 'zod';

export const tenantStatusSchema = z.enum(['active', 'suspended']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const createTenantSchema = z.object({
  name: z.string().min(1).max(128),
  code: z.string().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/),
  adminUsername: z.string().min(3).max(64),
  adminDisplayName: z.string().min(1).max(64),
  adminPhone: z.string().max(20).optional(),
}).strict();
export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const setTenantStatusSchema = z.object({
  status: tenantStatusSchema,
});
export type SetTenantStatusInput = z.infer<typeof setTenantStatusSchema>;

export const tenantListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  status: tenantStatusSchema,
  createdAt: z.string(),
  userCount: z.number(),
  agentCount: z.number(),
});
export type TenantListItem = z.infer<typeof tenantListItemSchema>;

export const createTenantResponseSchema = tenantListItemSchema.extend({
  adminUser: z.object({
    id: z.string(),
    username: z.string(),
    role: z.literal('system_admin'),
    displayName: z.string(),
  }),
  initialPassword: z.string(),
});
export type CreateTenantResponse = z.infer<typeof createTenantResponseSchema>;
