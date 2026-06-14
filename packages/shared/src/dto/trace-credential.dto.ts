import { z } from 'zod';

/** 资质类型:certificate=认证证书,report=检测报告。 */
export const traceCredentialTypeSchema = z.enum(['certificate', 'report']);
export type TraceCredentialType = z.infer<typeof traceCredentialTypeSchema>;

/** 后台视图:含内部 id,供管理端列表/删除。 */
export const traceCredentialViewSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  type: traceCredentialTypeSchema,
  title: z.string(),
  issuer: z.string(),
  serialNo: z.string().nullable(),
  issuedAt: z.string().nullable(),
  fileUrl: z.string(),
  createdAt: z.string(),
});
export type TraceCredentialView = z.infer<typeof traceCredentialViewSchema>;

/** 创建入参:fileUrl 由先行 OSS 上传得到。 */
export const createTraceCredentialSchema = z.object({
  batchId: z.string().uuid(),
  type: traceCredentialTypeSchema,
  title: z.string().min(1).max(128),
  issuer: z.string().min(1).max(128),
  serialNo: z.string().max(128).optional(),
  issuedAt: z.string().datetime().optional(),
  fileUrl: z.string().url().max(1024),
});
export type CreateTraceCredentialInput = z.infer<typeof createTraceCredentialSchema>;

/** 公开扫码脱敏视图:不暴露内部 id。 */
export const publicTraceCredentialSchema = z.object({
  type: traceCredentialTypeSchema,
  title: z.string(),
  issuer: z.string(),
  issuedAt: z.string().nullable(),
  fileUrl: z.string(),
});
export type PublicTraceCredential = z.infer<typeof publicTraceCredentialSchema>;
