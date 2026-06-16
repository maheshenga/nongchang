import { z } from 'zod';
export const loginSchema = z.object({
  // 机构编码:username 改为租户内唯一后,密码登录需 (tenantCode + username) 共同定位用户。
  tenantCode: z.string().min(1).max(64),
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export type RefreshDto = z.infer<typeof refreshSchema>;
