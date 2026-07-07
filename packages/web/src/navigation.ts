import {
  Building2,
  FileSpreadsheet,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Map,
  Plug,
  QrCode,
  Settings as SettingsIcon,
  Sparkles,
  Sprout,
  Store,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type SystemRole = 'system_admin' | 'agent_admin' | 'merchant_admin' | 'platform_admin' | 'member';

export type AppTab =
  | 'overview'
  | 'tenants'
  | 'fields'
  | 'merchant'
  | 'batches'
  | 'records'
  | 'logistics'
  | 'settings'
  | 'agents'
  | 'merchantFiles'
  | 'aiProviders'
  | 'aiOssSettings'
  | 'integrations'
  | 'userGroups'
  | 'pendingUsers'
  | 'quickTemplates'
  | 'aiAssistant'
  | 'phenology'
  | 'billing';

export type NavItem = { id: AppTab; label: string; icon: LucideIcon };
export type NavCategory = { category: string; items: NavItem[] };

const PLATFORM_ADMIN_NAV: NavCategory[] = [
  {
    category: '平台运营',
    items: [{ id: 'tenants', label: '租户管理', icon: Building2 }],
  },
];

const SYSTEM_ADMIN_NAV: NavCategory[] = [
  {
    category: '生产与供应链',
    items: [
      { id: 'overview', label: '生产总览', icon: LayoutDashboard },
      { id: 'fields', label: '数字地块', icon: Map },
      { id: 'records', label: '农事实操记录', icon: FileSpreadsheet },
      { id: 'phenology', label: '标准物候模型', icon: Sprout },
      { id: 'batches', label: '全域批次追踪', icon: Layers },
      { id: 'logistics', label: '农资投入品管理', icon: Truck },
    ],
  },
  {
    category: '平台组织管理',
    items: [
      { id: 'agents', label: '代理商管理', icon: Users },
      { id: 'merchantFiles', label: '商户管理与档案', icon: Store },
    ],
  },
  {
    category: '系统',
    items: [
      { id: 'aiAssistant', label: 'AI 助手', icon: Sparkles },
      { id: 'aiProviders', label: 'AI 服务商', icon: Sparkles },
      { id: 'billing', label: '算力与额度', icon: Wallet },
      { id: 'aiOssSettings', label: 'AI 与存储设置', icon: SettingsIcon },
      { id: 'integrations', label: '第三方集成', icon: Plug },
      { id: 'userGroups', label: '用户分组', icon: UserCog },
      { id: 'pendingUsers', label: '入驻审核', icon: UserCheck },
      { id: 'quickTemplates', label: '快捷模板', icon: LayoutTemplate },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
];

const AGENT_ADMIN_NAV: NavCategory[] = [
  {
    category: '业务与系统',
    items: [
      { id: 'overview', label: '生产总览', icon: LayoutDashboard },
      { id: 'batches', label: '辖区批次追踪', icon: Layers },
      { id: 'billing', label: '算力与额度', icon: Wallet },
      { id: 'userGroups', label: '用户分组', icon: UserCog },
      { id: 'quickTemplates', label: '快捷模板', icon: LayoutTemplate },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
  {
    category: '代理商中心',
    items: [{ id: 'merchantFiles', label: '旗下商家管理', icon: Store }],
  },
];

const MERCHANT_ADMIN_NAV: NavCategory[] = [
  {
    category: '生产与档案',
    items: [
      { id: 'overview', label: '生产总览', icon: LayoutDashboard },
      { id: 'fields', label: '我的地块管理', icon: Map },
      { id: 'merchant', label: '我的芍药档案', icon: QrCode },
      { id: 'records', label: '农事实操', icon: FileSpreadsheet },
      { id: 'batches', label: '我的批次记录', icon: Layers },
      { id: 'logistics', label: '农资投入品管理', icon: Truck },
    ],
  },
  {
    category: '系统',
    items: [
      { id: 'aiAssistant', label: 'AI 助手', icon: Sparkles },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
];

const MEMBER_NAV: NavCategory[] = [
  {
    category: '个人中心',
    items: [{ id: 'settings', label: '本地偏好', icon: SettingsIcon }],
  },
];

const NAV_BY_ROLE: Record<SystemRole, NavCategory[]> = {
  platform_admin: PLATFORM_ADMIN_NAV,
  system_admin: SYSTEM_ADMIN_NAV,
  agent_admin: AGENT_ADMIN_NAV,
  merchant_admin: MERCHANT_ADMIN_NAV,
  member: MEMBER_NAV,
};

export const getNavItems = (role: SystemRole): NavCategory[] => NAV_BY_ROLE[role];

export const isSystemRole = (role: string | null | undefined): role is SystemRole =>
  !!role && role in NAV_BY_ROLE;

export const flattenNavItems = (items: NavCategory[]): NavItem[] =>
  items.flatMap((category) => category.items);

export const firstAllowedTab = (
  role: SystemRole,
  requestedTab: string | null | undefined,
): AppTab => {
  const items = flattenNavItems(getNavItems(role));
  const allowed = items.find((item) => item.id === requestedTab);
  return allowed?.id ?? items[0].id;
};
