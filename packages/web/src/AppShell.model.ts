import { isSystemRole, type AppTab, type SystemRole } from './navigation';

export interface RoleDisplay {
  title: string;
  subtitle: string;
  badge: string;
  short: string;
}

export function roleDisplay(role: SystemRole | null): RoleDisplay {
  if (role === 'platform_admin') return { title: 'Platform Admin', subtitle: '平台运营账户', badge: '平台管理员', short: 'Platform' };
  if (role === 'system_admin') return { title: 'Super Admin', subtitle: '企业授权账户', badge: '总管理员', short: 'Super Admin' };
  if (role === 'agent_admin') return { title: 'Agent Admin', subtitle: '代理商管理账户', badge: '代理商', short: 'Agent' };
  if (role === 'member') return { title: 'Member', subtitle: '普通会员账户', badge: '普通会员', short: 'Member' };
  return { title: 'Merchant', subtitle: '商户工作台账户', badge: '商户', short: 'Merchant' };
}

export function toSystemRole(role: string): SystemRole {
  if (role === 'merchant') return 'merchant_admin';
  if (isSystemRole(role)) return role;
  return 'member';
}

export function navLabel(id: AppTab, label: string): string {
  if (id === 'batches') return '批次管理';
  if (id === 'fields') return '地块管理';
  if (id === 'billing') return '计费中心';
  return label;
}
