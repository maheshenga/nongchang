import type { AppTab, SystemRole } from '../../navigation';

export interface DashboardQuickAction {
  tab: AppTab;
  label: string;
  description: string;
}

const QUICK_ACTIONS: Record<SystemRole, DashboardQuickAction[]> = {
  merchant_admin: [
    { tab: 'records', label: '新建农事记录', description: '记录今天的种植、巡田或质检工作' },
    { tab: 'batches', label: '查看在管批次', description: '跟进种植阶段、溯源码和扫码数据' },
    { tab: 'fields', label: '管理数字地块', description: '维护地块位置、面积和设备信息' },
  ],
  agent_admin: [
    { tab: 'merchantFiles', label: '处理商户异常', description: '进入旗下商家档案与经营概览' },
    { tab: 'batches', label: '查看辖区批次', description: '跟进辖区内批次生产与溯源状态' },
    { tab: 'billing', label: '查看算力额度', description: '核对 AI 与生码额度余额' },
  ],
  system_admin: [
    { tab: 'pendingUsers', label: '审核入驻申请', description: '处理待审核的租户成员申请' },
    { tab: 'integrations', label: '修复集成配置', description: '检查微信、讯飞和天地图可用性' },
    { tab: 'billing', label: '查看额度预警', description: '检查 AI 与生码额度是否充足' },
  ],
  platform_admin: [
    { tab: 'tenants', label: '管理租户生命周期', description: '查看租户开通、状态与平台归属' },
  ],
  member: [
    { tab: 'memberHome', label: '查看会员中心', description: '查看个人会员与溯源入口' },
    { tab: 'settings', label: '管理本地偏好', description: '调整当前设备上的显示偏好' },
  ],
};

const TITLES: Record<SystemRole, string> = {
  merchant_admin: '商户生产工作台',
  agent_admin: '代理商运营工作台',
  system_admin: '租户运营工作台',
  platform_admin: '平台租户工作台',
  member: '会员个人工作台',
};

export function dashboardQuickActions(role: SystemRole): DashboardQuickAction[] {
  return QUICK_ACTIONS[role];
}

export function dashboardTitle(role: SystemRole): string {
  return TITLES[role];
}
