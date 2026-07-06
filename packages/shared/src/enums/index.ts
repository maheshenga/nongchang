export const Role = {
  PLATFORM_ADMIN: 'platform_admin',
  SYSTEM_ADMIN: 'system_admin',
  AGENT_ADMIN: 'agent_admin',
  MERCHANT: 'merchant',
  MEMBER: 'member',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Permission = {
  RECORD_CREATE: 'record:create',
  RECORD_VIEW: 'record:view',
  TRACE_VIEW: 'trace:view',
  BATCH_VIEW: 'batch:view',
  FIELD_VIEW: 'field:view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const BatchStatus = {
  PLANTING: 'Planting', GROWING: 'Growing', HARVESTED: 'Harvested', DISTRIBUTED: 'Distributed',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const TraceEventType = {
  ORIGIN: 'origin', FARM: 'farm', HARVEST: 'harvest',
  WAREHOUSE: 'warehouse', LOGISTICS: 'logistics', RETAIL: 'retail',
} as const;
export type TraceEventType = (typeof TraceEventType)[keyof typeof TraceEventType];

export const FarmRecordSource = {
  WEB: 'web', MINIAPP: 'miniapp', VOICE: 'voice',
} as const;
export type FarmRecordSource = (typeof FarmRecordSource)[keyof typeof FarmRecordSource];
