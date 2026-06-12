import { z } from 'zod';
export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export type RefreshDto = z.infer<typeof refreshSchema>;
