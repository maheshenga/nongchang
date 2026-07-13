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

export const webAccessTokenResponseSchema = z.object({ accessToken: z.string().min(1) });
export type WebAccessTokenResponse = z.infer<typeof webAccessTokenResponseSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

// ---- 个人账号(/auth/me):任意已登录角色自助查看/维护本人资料 ----
// 个人资料视图:绝不含 passwordHash / wxOpenid 等敏感字段。
export const meProfileViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  username: z.string(),
  role: z.string(),
  agentId: z.string().nullable(),
  displayName: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
});
export type MeProfileView = z.infer<typeof meProfileViewSchema>;

// 自助改资料:仅放开 displayName / phone,至少提供一项。
export const updateMeSchema = z.object({
  displayName: z.string().min(2).max(64).optional(),
  phone: z.string().max(20).nullable().optional(),
}).refine((d) => d.displayName !== undefined || d.phone !== undefined, {
  message: '至少提供一项更新字段', path: ['displayName'],
});
export type UpdateMeDto = z.infer<typeof updateMeSchema>;

// 自助改密码:校验旧密码后设置新密码,新旧不得相同。
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(6).max(128),
  newPassword: z.string().min(6).max(128),
}).refine((d) => d.oldPassword !== d.newPassword, {
  message: '新密码不能与旧密码相同', path: ['newPassword'],
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
