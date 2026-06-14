// 叠加式权限点常量表。
// 现有 role 体系(system_admin/agent_admin/merchant)仍是授权底座;
// 这些权限点用于在需要细粒度叠加的新端点上,通过 UserGroup.permissions 额外授予。
export const PERMISSIONS = {
  RECORD_CREATE: 'record:create',
  RECORD_VIEW: 'record:view',
  TRACE_VIEW: 'trace:view',
  BATCH_VIEW: 'batch:view',
  FIELD_VIEW: 'field:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);
