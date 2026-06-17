import { z } from 'zod';

// ── 集成配置(第三方凭证)──
// provider 类型:wechat(微信小程序登录)、xfyun(讯飞语音听写)、tianditu(天地图底图)
export const integrationProviderSchema = z.enum(['wechat', 'xfyun', 'tianditu']);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

// 微信:appId 明文 + secret 密文
export const wechatConfigInputSchema = z.object({
  appId: z.string().min(1).max(64),
  secret: z.string().optional(), // 空=不改
  enabled: z.boolean().optional(),
});
export type WechatConfigInput = z.infer<typeof wechatConfigInputSchema>;

// 讯飞:appId 明文 + apiKey/apiSecret 密文
export const xfyunConfigInputSchema = z.object({
  appId: z.string().min(1).max(64),
  apiKey: z.string().optional(),    // 空=不改
  apiSecret: z.string().optional(), // 空=不改
  enabled: z.boolean().optional(),
});
export type XfyunConfigInput = z.infer<typeof xfyunConfigInputSchema>;

// 天地图:key 为纯前端 JS API 密钥(浏览器可见,靠域名白名单防盗用),用 appId 字段承载。
export const tiandituConfigInputSchema = z.object({
  key: z.string().min(1).max(128),
  enabled: z.boolean().optional(),
});
export type TiandituConfigInput = z.infer<typeof tiandituConfigInputSchema>;

// 天地图公开读取视图:返回启用中的 key 供前端加载地图脚本(未启用则 null)。
export const tiandituPublicSchema = z.object({
  key: z.string().nullable(),
});
export type TiandituPublicView = z.infer<typeof tiandituPublicSchema>;

// 统一查看视图(密钥脱敏)
export const integrationConfigViewSchema = z.object({
  provider: integrationProviderSchema,
  appId: z.string().nullable(),
  secretMasked: z.string().nullable(),    // 微信 Secret 脱敏
  apiKeyMasked: z.string().nullable(),     // 讯飞 APIKey 脱敏
  apiSecretMasked: z.string().nullable(),  // 讯飞 APISecret 脱敏
  enabled: z.boolean(),
});
export type IntegrationConfigView = z.infer<typeof integrationConfigViewSchema>;

// ── 用户组(叠加式权限)──
export const userGroupInputSchema = z.object({
  name: z.string().min(1).max(64),
  isDefault: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
});
export type UserGroupInput = z.infer<typeof userGroupInputSchema>;

export const userGroupViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
});
export type UserGroupView = z.infer<typeof userGroupViewSchema>;

export const assignUserGroupSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1).nullable(),
});
export type AssignUserGroupInput = z.infer<typeof assignUserGroupSchema>;

// ── 微信登录 ──
export const wechatLoginSchema = z.object({
  code: z.string().min(1),
  appId: z.string().min(1),
});
export type WechatLoginDto = z.infer<typeof wechatLoginSchema>;

// ── 微信自助注册(需后台审核) ──
export const wechatRegisterSchema = z.object({
  appId: z.string().min(1),
  code: z.string().min(1),
  displayName: z.string().min(2).max(64),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确').optional(),
});
export type WechatRegisterDto = z.infer<typeof wechatRegisterSchema>;

export interface WechatRegisterResponse {
  status: 'pending';
}

// ── 待审核用户(脱敏视图) ──
export const pendingUserViewSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  phone: z.string().nullable(),
  createdAt: z.string(),
});
export type PendingUserView = z.infer<typeof pendingUserViewSchema>;

export const reviewUserSchema = z.object({
  action: z.enum(['approve', 'reject']),
});
export type ReviewUserInput = z.infer<typeof reviewUserSchema>;
