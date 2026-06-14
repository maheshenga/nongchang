import { z } from 'zod';

// ── 集成配置(第三方凭证)──
// provider 类型:wechat(微信小程序登录)、xfyun(讯飞语音听写)
export const integrationProviderSchema = z.enum(['wechat', 'xfyun']);
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
