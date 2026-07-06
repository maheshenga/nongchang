import { Permission } from '@nongchang/shared';

export const DEFAULT_USER_GROUP_PERMISSIONS = [
  Permission.RECORD_CREATE,
  Permission.RECORD_VIEW,
  Permission.FIELD_VIEW,
  Permission.BATCH_VIEW,
  Permission.TRACE_VIEW,
] as const;
