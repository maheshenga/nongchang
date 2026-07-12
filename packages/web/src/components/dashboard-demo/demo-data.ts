export const scanData = [
  { name: 'Mon', scans: 4000 }, { name: 'Tue', scans: 3000 }, { name: 'Wed', scans: 2000 },
  { name: 'Thu', scans: 2780 }, { name: 'Fri', scans: 1890 }, { name: 'Sat', scans: 2390 }, { name: 'Sun', scans: 3490 },
];

export const cropData = [
  { name: '精品春白芍', value: 450 }, { name: '名贵紫凤朝阳', value: 320 },
  { name: '典雅冠世墨玉', value: 280 }, { name: '特级朱砂判', value: 150 },
];

export const yieldData = [
  { month: '1月', 春白芍: 1200, 紫凤朝阳: 800 }, { month: '2月', 春白芍: 1300, 紫凤朝阳: 850 },
  { month: '3月', 春白芍: 1500, 紫凤朝阳: 900 }, { month: '4月', 春白芍: 1800, 紫凤朝阳: 1100 },
  { month: '5月', 春白芍: 1400, 紫凤朝阳: 1300 }, { month: '6月', 春白芍: 1100, 紫凤朝阳: 1500 },
];

export const costData = [
  { subject: '组培扩繁', 成本投入: 120, 产出预期: 110, fullMark: 150 },
  { subject: '移栽上盆', 成本投入: 98, 产出预期: 130, fullMark: 150 },
  { subject: '日常植保', 成本投入: 86, 产出预期: 130, fullMark: 150 },
  { subject: '病害防治', 成本投入: 99, 产出预期: 100, fullMark: 150 },
  { subject: '水肥管理', 成本投入: 85, 产出预期: 90, fullMark: 150 },
];

export const ganttData = [
  { task: '组培扩繁', start: 0, duration: 25 }, { task: '温室养护', start: 25, duration: 55 },
  { task: '休眠促花', start: 80, duration: 25 }, { task: '病害检测', start: 105, duration: 5 },
  { task: '分拣出库', start: 110, duration: 10 },
];

export const recentTraces = [
  { id: 'ORC-8901', name: '极品春白芍大雪素', path: '大理培育基地 → 恒温转运仓 → 昆明花卉市场', time: '2分钟前', loc: '云南·昆明' },
  { id: 'ORC-8902', name: '素心紫凤朝阳', path: '福建南靖基地 → 广州芳村转运 → 深圳体验店', time: '5分钟前', loc: '广东·深圳' },
  { id: 'ORC-8903', name: '紫秀冠世墨玉', path: '韶关组培中心 → 顺丰冷链包 → 上海买家签收', time: '12分钟前', loc: '上海·徐汇' },
];

export const topologyNodes = [
  { id: 'base', name: '培育基地', stock: '12,500 株', x: '10%', logs: ['10:00 批次完成休眠', '08:30 大棚巡检'] },
  { id: 'transit', name: '中转中心', stock: '5,200 株', x: '38%', logs: ['14:20 接收冷链包', '13:00 发往市场'] },
  { id: 'market', name: '花卉市场', stock: '2,100 株', x: '66%', logs: ['15:40 确认签收', '16:00 分销配货'] },
  { id: 'store', name: '授权门店', stock: '1,500 株', x: '88%', logs: ['18:00 门店盘点', '15:30 售出 5 株'] },
];

export const farmAlerts = [
  { tone: 'blue', title: '气象预警：未来72小时强降雨', detail: '演示数据：预计累计降水超 50mm。' },
  { tone: 'red', title: '病虫害预警：C区介壳虫风险', detail: '演示数据：建议安排叶背巡查。' },
  { tone: 'amber', title: '排期偏离：B区晚于示例计划', detail: '演示数据：当前偏离 6 天。' },
];

export const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];
