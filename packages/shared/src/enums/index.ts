export const Role = {
  SYSTEM_ADMIN: 'system_admin', AGENT_ADMIN: 'agent_admin', MERCHANT: 'merchant',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

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
