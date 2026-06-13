import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, BarChart, Bar } from 'recharts';
import { Sprout, ScanLine, Smartphone, Layers, AlertTriangle, Thermometer, Bug, Download, FileSpreadsheet, MapPin, Clock, Sparkles, Map, Loader2, Calendar, X, ImageIcon, Mail, AlertOctagon, FileBadge, Image as ImageIcon2, QrCode, PenTool, CloudRainWind, GitCommit, CheckCircle2, CheckCircle, ChevronsRightLeft } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import html2canvas from 'html2canvas';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import HeatmapD3 from './HeatmapD3';
import D3GeoMap from './D3GeoMap';
import AntiFakeMonitor from './AntiFakeMonitor';
import RfidMonitor from './RfidMonitor';
import DemoBadge from './DemoBadge';

const ResponsiveGridLayout = WidthProvider(Responsive);

const costData = [
  { subject: '组培扩繁', 成本投入: 120, 产出预期: 110, fullMark: 150 },
  { subject: '移栽上盆', 成本投入: 98, 产出预期: 130, fullMark: 150 },
  { subject: '日常植保', 成本投入: 86, 产出预期: 130, fullMark: 150 },
  { subject: '病害防治', 成本投入: 99, 产出预期: 100, fullMark: 150 },
  { subject: '水肥管理', 成本投入: 85, 产出预期: 90, fullMark: 150 },
  { subject: '采收分株', 成本投入: 65, 产出预期: 85, fullMark: 150 },
];

const scanData = [
  { name: 'Mon', scans: 4000 },
  { name: 'Tue', scans: 3000 },
  { name: 'Wed', scans: 2000 },
  { name: 'Thu', scans: 2780 },
  { name: 'Fri', scans: 1890 },
  { name: 'Sat', scans: 2390 },
  { name: 'Sun', scans: 3490 },
];

const cropData = [
  { name: '精品春白芍', value: 450 },
  { name: '名贵紫凤朝阳', value: 320 },
  { name: '典雅冠世墨玉', value: 280 },
  { name: '特级朱砂判', value: 150 },
];

const yieldData = [
  { month: '1月', 春白芍: 1200, 紫凤朝阳: 800 },
  { month: '2月', 春白芍: 1300, 紫凤朝阳: 850 },
  { month: '3月', 春白芍: 1500, 紫凤朝阳: 900 },
  { month: '4月', 春白芍: 1800, 紫凤朝阳: 1100 },
  { month: '5月', 春白芍: 1400, 紫凤朝阳: 1300 },
  { month: '6月', 春白芍: 1100, 紫凤朝阳: 1500 },
];

const recentTraces = [
  { id: 'ORC-8901', name: '极品春白芍大雪素', path: '大理培育基地 → 恒温转运仓 → 昆明花卉市场', time: '2分钟前', loc: '云南·昆明' },
  { id: 'ORC-8902', name: '素心紫凤朝阳', path: '福建南靖基地 → 广州芳村转运 → 深圳体验店', time: '5分钟前', loc: '广东·深圳' },
  { id: 'ORC-8903', name: '紫秀冠世墨玉', path: '韶关组培中心 → 顺丰冷链包 → 上海买家签收', time: '12分钟前', loc: '上海·徐汇' },
  { id: 'ORC-8904', name: '朱砂判仙客', path: '温州高山芍药园 → 杭州电商仓 -> 用户签收', time: '25分钟前', loc: '浙江·杭州' },
];

const ganttData = [
  { task: '组培扩繁', start: 0, duration: 25 },
  { task: '温室养护', start: 25, duration: 55 },
  { task: '休眠促花', start: 80, duration: 25 },
  { task: '病害检测', start: 105, duration: 5 },
  { task: '分拣出库', start: 110, duration: 10 },
];

const financeData = [
  { name: '北京特许分销区', 回款进度: 85, 历史交易额: 240, 信用评分: 95 },
  { name: '上海花卉集散地', 回款进度: 92, 历史交易额: 310, 信用评分: 98 },
  { name: '广州南方批发', 回款进度: 60, 历史交易额: 180, 信用评分: 75 },
  { name: '成都西南直营', 回款进度: 78, 历史交易额: 220, 信用评分: 88 },
  { name: '海外外贸出口', 回款进度: 45, 历史交易额: 500, 信用评分: 90 },
];

const historicalComparisonData = [
  { year: '2023', 平均种植周期: 115, 最终产量: 12000 },
  { year: '2024', 平均种植周期: 110, 最终产量: 13500 },
  { year: '2025', 平均种植周期: 105, 最终产量: 15200 },
];

const cycleComparisonData = [
  { field: '高山温室A区', 实际耗时: 105, 理想预设: 90 },
  { field: '露地B区', 实际耗时: 120, 理想预设: 110 },
  { field: '梯田C区', 实际耗时: 95, 理想预设: 90 },
  { field: '沿河D区', 实际耗时: 130, 理想预设: 115 },
  { field: '实验E区', 实际耗时: 85, 理想预设: 90 },
];

const yieldTrendData = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    采收产量: Math.floor(Math.random() * 50) + 100 + i * 5,
  };
});

const plotYieldData = [
  { plot: 'A区温室', 优质产出: 4500, 普通产出: 800 },
  { plot: 'B区露地', 优质产出: 3200, 普通产出: 2100 },
  { plot: 'C区梯田', 优质产出: 2800, 普通产出: 1500 },
  { plot: 'D区示范区', 优质产出: 5500, 普通产出: 300 },
];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

export default function Dashboard() {
  const [exportRange, setExportRange] = useState('7days');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingGantt, setIsExportingGantt] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);
  const [activeTopologyNode, setActiveTopologyNode] = useState<{ id: string, name: string, stock: string, logs: string[] } | null>(null);

  const [aiReport, setAiReport] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scheduleReport, setScheduleReport] = useState('');
  const [isPredicting, setIsPredicting] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // GIS Electronic Fence states
  const [isDrawingFence, setIsDrawingFence] = useState(false);
  const [fenceAlarm, setFenceAlarm] = useState<string | null>(null);
  
  // GIS Annotation variables
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationAlarm, setAnnotationAlarm] = useState<string | null>(null);

  // Auto-Alert state
  const [showAutoAlert, setShowAutoAlert] = useState(true);

  // PDF Export Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [globalAlerts, setGlobalAlerts] = useState<{id: string, message: string}[]>([]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
       interval = setInterval(() => {
          // Trigger a fake re-render to simulate auto-refresh
          // No-op for now unless we need real refresh
       }, 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const togglePresentationMode = (active: boolean) => {
    setIsPresentationMode(active);
    const event = new CustomEvent('toggle-presentation', { detail: { mode: active } });
    window.dispatchEvent(event);
  };

  useEffect(() => {
    const handleDeviationAlert = (e: Event) => {
      const customEvent = e as CustomEvent;
      const newAlert = { id: Date.now().toString(), message: customEvent.detail.message };
      setGlobalAlerts(prev => [...prev, newAlert]);
      // auto dismiss
      setTimeout(() => setGlobalAlerts(prev => prev.filter(a => a.id !== newAlert.id)), 8000);
    };
    window.addEventListener('farm-deviation-alert', handleDeviationAlert);
    return () => window.removeEventListener('farm-deviation-alert', handleDeviationAlert);
  }, []);
  const [pdfLayout, setPdfLayout] = useState('standard');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  // AI Assistant Sidebar State
  const [showAiSidebar, setShowAiSidebar] = useState(false);
  const [aiChatQuery, setAiChatQuery] = useState('');
  const [aiChatResponse, setAiChatResponse] = useState<string | null>(null);
  const [isAiAnswering, setIsAiAnswering] = useState(false);

  // Farm Tasks State
  const [farmTasks, setFarmTasks] = useState([
    { id: '1', title: 'C区介壳虫防治喷药', desc: '使用噻嗪酮1000倍液喷淋，重点叶背。', priority: 'urgency', assignee: '李组长', status: 'todo' }
  ]);

  useEffect(() => {
    const handleRecordSync = (e: any) => {
       const { batchId } = e.detail;
       if (batchId) {
         setFarmTasks(prev => [{
           id: Math.random().toString(),
           title: `同步批次 ${batchId}`,
           desc: '系统检测到新农事记录录入，同步更新作业提醒',
           priority: 'normal',
           assignee: '系统自动生成',
           status: 'todo'
         }, ...prev]);
       }
    };
    window.addEventListener('farm-record-added', handleRecordSync);
    return () => window.removeEventListener('farm-record-added', handleRecordSync);
  }, []);

  const handleAiChat = async () => {
    if (!aiChatQuery.trim()) return;
    setIsAiAnswering(true);
    setAiChatResponse(null);
    setTimeout(() => {
      setAiChatResponse(`系统已根据您的描述关联当前种植批次 [OB-2023-11 极品春白芍]。\n\n【肥料推荐方案】\n推荐配方：高磷高钾复合肥 (15-15-15)\n施用建议：结合当下休眠促花阶段，建议每亩追施15kg，并配合叶面喷施0.2%的磷酸二氢钾，以提高花苞饱满度。`);
      setIsAiAnswering(false);
    }, 1500);
  };

  const handlePdfExport = () => {
    setIsExportingPdf(true);
    setTimeout(() => {
      setIsExportingPdf(false);
      setIsPdfModalOpen(false);
    }, 2000);
  };


  const NODE_DETAILS = {
    base: { id: 'base', name: '培育基地', stock: '12,500 株', logs: ['10:00 批次OB-23完成休眠', '08:30 完成大棚B区病害巡检'] },
    transit: { id: 'transit', name: '中转集散中心', stock: '5,200 株', logs: ['14:20 接收顺丰冷链包A001', '13:00 发往昆明斗南市场 2.1k'] },
    market: { id: 'market', name: '花卉批发市场', stock: '2,100 株', logs: ['15:40 确认签收中转来货', '16:00 开始分销商配货'] },
    store: { id: 'store', name: '授权专卖店', stock: '1,500 株', logs: ['昨日 18:00 门店盘点完成', '昨日 15:30 售出春白芍单品 5株'] },
    online: { id: 'online', name: '生鲜平台前置仓', stock: '1,600 株', logs: ['09:00 前置仓系统库存同步完成'] },
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      const csvContent = scanData.map(d => `${d.name},${d.scans}`).join('\n');
      const blob = new Blob([`Name,Scans\n${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `scan_data_export_${exportRange}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      setIsExporting(false);
    }, 1500);
  };

  const handleExportGantt = async () => {
    if (!ganttRef.current) return;
    setIsExportingGantt(true);
    try {
      const canvas = await html2canvas(ganttRef.current, { backgroundColor: '#ffffff', scale: 2 } as any);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gantt-export.png';
      a.click();
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingGantt(false);
    }
  };

  const handleAiPredict = async () => {
    setIsPredicting(true);
    // Simulate AI prediction locally since no backend is set up
    setTimeout(() => {
      setIsPredicting(false);
      setScheduleReport(`基于当前温湿度及农事记录分析，大棚 A 区的春白芍预计将于下周三达到最佳采收期。B、C 区生长状况正常，未见明显滞后。`);
    }, 1500);
  };

  const handleAiAnalysis = async () => {
    setIsAnalyzing(true);
    // Simulate AI analysis locally since no backend is set up
    setTimeout(() => {
      setIsAnalyzing(false);
      setAiReport(`整体长势评估：优良。近期昼夜温差适宜（差值>12℃），有利于花青素与干物质积累。建议在未来三天调整 B 区滴灌系统，增加 10% 补水量以预防末端缺水。`);
    }, 1500);
  };

  const layout = [
    { i: 'alerts', x: 0, y: 0, w: 12, h: 2, static: false },
    { i: 'stats', x: 0, y: 2, w: 12, h: 2, static: false },
    { i: 'main-chart', x: 0, y: 4, w: 8, h: 5, static: false },
    { i: 'pie-chart', x: 8, y: 4, w: 4, h: 5, static: false },
    { i: 'gantt-chart', x: 0, y: 9, w: 12, h: 4, static: false },
    { i: 'audit-panel', x: 0, y: 13, w: 12, h: 4, static: false },
    { i: 'cycle-chart', x: 0, y: 17, w: 12, h: 5, static: false }, // New cycle chart
    { i: 'yield-chart', x: 0, y: 22, w: 6, h: 5, static: false },
    { i: 'cost-chart', x: 6, y: 22, w: 6, h: 5, static: false },
    { i: 'finance-chart', x: 0, y: 27, w: 12, h: 5, static: false },
    { i: 'historical-comparison', x: 0, y: 32, w: 12, h: 6, static: false },
    { i: 'trace-list', x: 0, y: 38, w: 12, h: 5, static: false },
    { i: 'topology-chart', x: 0, y: 43, w: 12, h: 4, static: false },
    { i: 'lifecycle-sandbox', x: 0, y: 47, w: 12, h: 6, static: false },
    { i: 'team-collaboration', x: 0, y: 53, w: 12, h: 5, static: false },
    { i: 'gis-map', x: 0, y: 58, w: 6, h: 4, static: false },
    { i: 'ai-panel', x: 6, y: 58, w: 6, h: 4, static: false },
    { i: 'geo-heatmap', x: 0, y: 62, w: 12, h: 7, static: false }, // Replaced heatmap-d3
    { i: 'anti-fake-monitor', x: 0, y: 69, w: 12, h: 5, static: false },
    { i: 'annual-performance', x: 0, y: 74, w: 12, h: 6, static: false },
    { i: 'rfid-monitor', x: 0, y: 80, w: 12, h: 5, static: false },
    { i: 'yield-trend-30days', x: 0, y: 85, w: 6, h: 5, static: false },
    { i: 'plot-comparison', x: 6, y: 85, w: 6, h: 5, static: false },
  ];

  return (
    <div className={`space-y-4 pb-8 relative overflow-hidden ${isPresentationMode ? 'min-h-screen' : ''}`}>
      {isPresentationMode && (
         <button 
           onClick={() => togglePresentationMode(false)}
           className="fixed bottom-8 right-8 z-[100] bg-slate-900/90 backdrop-blur text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 hover:bg-slate-900 transition-colors animate-in slide-in-from-bottom cursor-pointer text-sm font-bold border border-white/20"
         >
           <X className="w-5 h-5" /> 退出全屏演示
         </button>
      )}

      {globalAlerts.length > 0 && (
         <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
            {globalAlerts.map(alert => (
               <div key={alert.id} className="bg-red-600 text-white shadow-2xl rounded-xl p-4 flex items-start gap-4 border-2 border-red-400 w-80 pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-300">
                  <div className="bg-white p-2 rounded-full shrink-0 animate-pulse text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                     <h4 className="font-black text-sm mb-1 uppercase tracking-wider">智能排期·偏离预警</h4>
                     <p className="text-xs text-red-100 leading-relaxed font-medium">{alert.message}</p>
                  </div>
                  <button onClick={() => setGlobalAlerts(prev => prev.filter(a => a.id !== alert.id))} className="text-white hover:text-red-200 shrink-0">
                     <X className="w-4 h-4" />
                  </button>
               </div>
            ))}
         </div>
      )}
      <div className="flex justify-between items-center text-sm px-2">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">可拖拽自定义监控看板 <DemoBadge /></h2>
        <div className="flex items-center gap-3">
          <span className="text-slate-500">所有卡片均可拖拽排序改变布局</span>
          <button 
             onClick={() => setIsPdfModalOpen(true)}
             className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded transition-colors hover:bg-indigo-100 font-medium shadow-sm"
          >
             <FileSpreadsheet className="w-3 h-3" /> 年度溯源决策报告 (PDF)
          </button>
          <button 
             onClick={() => setShowAiSidebar(true)}
             className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded transition-colors hover:bg-purple-100 font-medium shadow-sm"
          >
             <Sparkles className="w-3 h-3" /> 智能种植顾问 (AI)
          </button>
          <button 
             onClick={() => togglePresentationMode(true)}
             className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded transition-colors hover:bg-emerald-100 font-medium shadow-sm"
          >
             <Layers className="w-3 h-3" /> 全屏演示模式
          </button>
          <button 
             onClick={() => setAutoRefresh(!autoRefresh)}
             className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors font-medium shadow-sm border
               ${autoRefresh ? 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
          >
             <Loader2 className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} /> 
             {autoRefresh ? '自动刷新: 开启' : '自动刷新: 关闭'}
          </button>
          <button 
             onClick={() => setIsEmailModalOpen(true)}
             className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded transition-colors hover:bg-blue-100 font-medium"
          >
             <Mail className="w-3 h-3" /> 周期性邮件推送
          </button>
        </div>
      </div>
      <ResponsiveGridLayout 
        className="layout" 
        layouts={{ lg: layout }} 
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} 
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} 
        rowHeight={70} 
        draggableHandle=".drag-handle"
      >
        <div key="alerts" className="h-full flex flex-col pt-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full drag-handle cursor-move">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-full">
                  <CloudRainWind className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-blue-900">气象预警: 未来72小时强降雨</h4>
                  <p className="text-[10px] text-blue-700 mt-1">预计累计降水超 50mm。请尽快组织防洪防霜冻作业。</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <Thermometer className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-red-900">休眠期温湿度异常预警</h4>
                  <p className="text-[10px] text-red-700 mt-1">当前温度 28°C，超出阀值 (+8°C)。</p>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-full">
                  <Bug className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">病虫害疑似警报 (1区)</h4>
                  <p className="text-[10px] text-amber-700 mt-1">AI检测到近期上传叶片异常。</p>
                </div>
              </div>
            </div>

            {showAutoAlert && (
              <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-xl shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-full">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-purple-900">Gemini AI 植保风险自动预警</h4>
                    <p className="text-[10px] text-purple-700 leading-tight mt-1">分析发现近期【白绢病】高发，已向大理基地负责人推送预防性杀菌任务清单。</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAutoAlert(false)}
                  className="text-[10px] text-purple-600 font-bold bg-purple-100 px-2 py-1 rounded ml-1"
                >
                   知道了
                </button>
              </div>
            )}
          </div>
        </div>

        <div key="stats" className="h-full flex flex-col pt-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full drag-handle cursor-move">
            {[
              { label: '在册芍药品种', value: '1,204', icon: Sprout, color: 'text-emerald-500', bg: 'bg-emerald-100' },
              { label: '累计生成溯源档案', value: '1.2M', icon: ScanLine, color: 'text-blue-500', bg: 'bg-blue-100' },
              { label: '花友扫码鉴真次数', value: '3.8M', icon: Smartphone, color: 'text-orange-500', bg: 'bg-orange-100' },
              { label: '授权经销商总数', value: '142', icon: Layers, color: 'text-purple-500', bg: 'bg-purple-100' },
            ].map((stat, i) => (
              <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center h-full">
                <div className="flex items-center justify-between mb-2">
                   <div className="text-slate-500 text-xs font-semibold">{stat.label}</div>
                   <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div key="main-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 drag-handle cursor-move">
              <h3 className="font-bold text-slate-800">近7天消费者扫码溯源趋势</h3>
              <div className="flex gap-2">
                <select 
                  title="Time range"
                  className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 focus:outline-none"
                  value={exportRange}
                  onChange={(e) => setExportRange(e.target.value)}
                >
                  <option value="7days">过去7天</option>
                  <option value="30days">过去30天</option>
                  <option value="all">全部记录</option>
                </select>
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1 rounded transition-colors font-medium disabled:opacity-50"
                >
                  {isExporting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                      导出中...
                    </span>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      导出报表 (CSV)
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="flex-1 mt-2 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scanData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                  />
                  <Area type="monotone" dataKey="scans" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorScans)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div key="pie-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move">各品种芍药出库流通占比</h3>
            <div className="flex-1 min-h-[0]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cropData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {cropData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {cropData.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index] }} />
                  <span className="text-[10px] text-slate-600 truncate">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div key="gantt-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full" ref={ganttRef}>
            <div className="flex justify-between items-center mb-4 drag-handle cursor-move">
              <h3 className="font-bold text-slate-800">芍药生长周期时间轴 (批次：OB-2023-11)</h3>
              <button 
                onClick={handleExportGantt}
                disabled={isExportingGantt}
                className="flex items-center gap-1.5 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded transition-colors font-medium disabled:opacity-50"
              >
                {isExportingGantt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                导出图片
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-center px-4 relative">
              {/* Grid Lines */}
              <div className="absolute inset-x-20 top-0 bottom-6 flex justify-between pointer-events-none border-l border-r border-slate-100">
                {[0, 30, 60, 90, 120].map(day => (
                  <div key={day} className="h-full w-px bg-slate-100" />
                ))}
              </div>
              {/* Bars */}
              <div className="flex flex-col gap-3 relative z-10">
                {ganttData.map((item, idx) => (
                   <div key={idx} className="flex items-center text-xs">
                     <div className="w-20 shrink-0 text-slate-600 font-medium truncate">{item.task}</div>
                     <div className="flex-1 h-5 rounded-full relative group">
                        <div 
                          className="absolute top-0 bottom-0 bg-emerald-500 rounded-full flex items-center pr-2 shadow-sm transition-all group-hover:brightness-110" 
                          style={{ left: `${(item.start/120)*100}%`, width: `${(item.duration/120)*100}%` }}
                        >
                          <span className="text-[10px] text-white/90 ml-auto font-medium">{item.duration}天</span>
                        </div>
                     </div>
                   </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-3 px-0 pl-20">
                <span>0天</span>
                <span>30天</span>
                <span>60天</span>
                <span>90天</span>
                <span>120天出圃</span>
              </div>
            </div>
          </div>
        </div>

        <div key="audit-panel" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-red-200 shadow-sm flex flex-col h-full overflow-hidden">
            <h3 className="font-bold text-red-800 mb-4 drag-handle cursor-move flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-red-600" />
              溯源数据异常审计与合规风控 (实时比对)
            </h3>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-red-50 text-red-700 sticky top-0">
                  <tr>
                     <th className="px-3 py-2 rounded-l">涉事批次号</th>
                     <th className="px-3 py-2">规则引擎触发策略</th>
                     <th className="px-3 py-2">数据冲突详情 (链上比对)</th>
                     <th className="px-3 py-2">潜在风险等级</th>
                     <th className="px-3 py-2 rounded-r">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  <tr className="hover:bg-red-50/50">
                     <td className="px-3 py-2.5 font-mono font-medium text-slate-700">OB-2024-03</td>
                     <td className="px-3 py-2.5 font-medium text-slate-800">时间防篡改校验未通过</td>
                     <td className="px-3 py-2.5 text-slate-600">质检报告出具时间早于实际送检农事记录记录 <span className="text-red-500 font-bold ml-1">早8小时</span></td>
                     <td className="px-3 py-2.5"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold border border-red-200">高危 - 伪造嫌疑</span></td>
                     <td className="px-3 py-2.5"><button className="text-blue-600 hover:text-blue-800 font-medium">阻断出库</button></td>
                  </tr>
                  <tr className="hover:bg-red-50/50">
                     <td className="px-3 py-2.5 font-mono font-medium text-slate-700">ORC-8902</td>
                     <td className="px-3 py-2.5 font-medium text-slate-800">流转节点异常跳跃</td>
                     <td className="px-3 py-2.5 text-slate-600">未经过中转集散中心直接出现在华东门店入库单记录中</td>
                     <td className="px-3 py-2.5"><span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold border border-amber-200">中危 - 漏扫或串货</span></td>
                     <td className="px-3 py-2.5"><button className="text-blue-600 hover:text-blue-800 font-medium">发起稽查</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div key="cycle-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              本年度各地块种植周期：实际耗时 vs 理想预设
            </h3>
            <div className="flex-1 min-h-0">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cycleComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="field" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} label={{ value: '时间 (天)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10, dy: -20 }} />
                    <Tooltip 
                       contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                       cursor={{fill: '#f8fafc'}}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
                    <Bar dataKey="实际耗时" fill="#3b82f6" name="实际耗时 (天)" radius={[4, 4, 0, 0]} barSize={30} />
                    <Bar dataKey="理想预设" fill="#10b981" name="理想预设 (天)" radius={[4, 4, 0, 0]} barSize={30} />
                  </BarChart>
               </ResponsiveContainer>
            </div>
            <div className="mt-3 text-[10px] text-slate-500 bg-slate-50 p-2 rounded flex justify-between">
              <span>分析研判：露地B区与沿河D区实际耗时严重超出理想预设，需重点排查。</span>
            </div>
          </div>
        </div>

        <div key="yield-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move">芍药分株出圃产量趋势 (月度统计)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yieldData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', marginTop: '10px' }} />
                  <Line type="monotone" dataKey="春白芍" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="紫凤朝阳" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div key="cost-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move">种植经济效益概览 (雷达分析)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={costData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{fill: '#64748b', fontSize: 10}} />
                  <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                  <Radar name="成本投入" dataKey="成本投入" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                  <Radar name="产出预期" dataKey="产出预期" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div key="finance-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move">供应链金融数据分析 (信用与回款)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financeData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} dy={5} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }} cursor={{fill: '#f1f5f9'}} />
                  <Legend wrapperStyle={{ fontSize: '10px', marginTop: '5px' }} />
                  <Bar yAxisId="left" dataKey="回款进度" barSize={20} fill="#3b82f6" name="回款进度 (%)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="历史交易额" stroke="#f59e0b" strokeWidth={2} name="历史交易额 (万)" dot={{ r: 4, strokeWidth: 2 }} />
                  <Line yAxisId="left" type="monotone" dataKey="信用评分" stroke="#10b981" strokeWidth={2} name="信用评分" dot={{ r: 4, strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div key="historical-comparison" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
             <div className="flex justify-between items-center mb-4 drag-handle cursor-move">
               <h3 className="font-bold text-slate-800">地块平均种植周期与最终产量年度对比 (高山温室 A区)</h3>
               <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 font-medium">辅助决策洞察：生长周期缩短趋势显著，单产稳步提升</span>
             </div>
             <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                   <ComposedChart data={historicalComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} label={{ value: '产量 (株)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10, dy: -20 }} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} label={{ value: '周期 (天)', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 10, dy: -20 }} />
                      <Tooltip 
                         contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                         cursor={{fill: '#f8fafc'}}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
                      <Bar yAxisId="left" dataKey="最终产量" barSize={40} fill="#8b5cf6" name="最终产量" radius={[6, 6, 0, 0]} opacity={0.8} />
                      <Line yAxisId="right" type="monotone" dataKey="平均种植周期" stroke="#10b981" strokeWidth={4} name="平均种植周期" dot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                   </ComposedChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>

        <div key="trace-list" className="h-full flex flex-col pt-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between drag-handle cursor-move">
               <h3 className="font-bold text-slate-800">最新溯源跟踪</h3>
               <a href="#" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">完整流向 →</a>
            </div>
            <div className="p-0 overflow-y-auto flex-1">
              <AnimatePresence>
              {recentTraces.map((trace, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={i} 
                  className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0 flex items-start gap-3"
                >
                  <div className="mt-1 w-8 h-8 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                     <ScanLine className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                         {trace.name}
                         <span className="text-[10px] font-mono text-slate-400 font-normal">{trace.id}</span>
                      </h4>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" /> {trace.time}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded inline-block mt-1 mb-2">
                      {trace.path}
                    </p>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                      <MapPin className="w-3 h-3 text-slate-300" />
                      终端扫码发生地: <span className="text-slate-600">{trace.loc}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div key="topology-chart" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move">芍药销售去向流转拓扑与库存</h3>
            <div className="flex-1 relative w-full h-full min-h-[160px] flex items-center justify-between px-2 lg:px-8 mt-2">
               
               {/* Popover for interactive node details (Expanded Card state) */}
               {activeTopologyNode && (
                 <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-300 border border-slate-200 rounded-2xl overflow-hidden flex flex-col md:flex-row h-64">
                   <div className="w-full md:w-1/3 bg-slate-800 text-white p-6 flex flex-col relative shrink-0">
                     <button onClick={() => setActiveTopologyNode(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                       <X className="w-5 h-5" />
                     </button>
                     <h4 className="font-bold text-xl">{activeTopologyNode.name}</h4>
                     <p className="text-emerald-400 text-sm font-mono mt-1 mb-6 border-b border-slate-700 pb-4">当前库存: {activeTopologyNode.stock}</p>
                     
                     <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                       <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">最新流转轨迹</p>
                       {activeTopologyNode.logs.map((log, i) => (
                         <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                               <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1"></div>
                               {i < activeTopologyNode.logs.length - 1 && <div className="w-0.5 h-full bg-slate-700 my-1"></div>}
                            </div>
                            <p className="text-sm text-slate-200">{log}</p>
                         </div>
                       ))}
                     </div>
                   </div>
                   
                   <div className="w-full md:w-2/3 p-6 bg-slate-50 flex gap-4 overflow-x-auto items-center">
                      <div className="w-48 h-full bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden shrink-0">
                         <div className="h-32 bg-slate-200 relative flex items-center justify-center">
                            <ImageIcon2 className="w-8 h-8 text-slate-400" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                            <span className="absolute bottom-2 left-2 text-[10px] text-white font-bold bg-black/30 px-1.5 py-0.5 rounded">流转现场影像</span>
                         </div>
                         <div className="p-3 text-xs text-slate-600">
                           <p className="font-bold text-slate-800 mb-1">入库实景记录</p>
                           <p>2026-06-07 14:00 拍摄于 {activeTopologyNode.name}</p>
                         </div>
                      </div>
                      <div className="w-48 h-full bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden shrink-0 relative">
                         <div className="absolute top-2 right-2 text-[10px] text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-sm font-bold border border-emerald-200 z-10 flex items-center gap-1">
                           <FileBadge className="w-3 h-3" /> 质检合格
                         </div>
                         <div className="flex-1 p-4 flex flex-col items-center justify-center border-b border-slate-100">
                            <QrCode className="w-16 h-16 text-slate-800 mb-2" />
                         </div>
                         <div className="p-3 text-xs text-slate-600 text-center bg-slate-50">
                           <p className="font-bold text-slate-800 mb-1">官方数字确权证书</p>
                           <p className="text-[10px] font-mono">HASH: 0x8f2...b4e</p>
                         </div>
                      </div>
                   </div>
                 </div>
               )}

               {/* Connections (SVG Lines) */}
               <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                 <line x1="18%" y1="50%" x2="40%" y2="50%" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4" />
                 <line x1="60%" y1="50%" x2="82%" y2="25%" stroke="#e2e8f0" strokeWidth="2" />
                 <line x1="60%" y1="50%" x2="82%" y2="50%" stroke="#e2e8f0" strokeWidth="2" />
                 <line x1="60%" y1="50%" x2="82%" y2="75%" stroke="#e2e8f0" strokeWidth="2" />
               </svg>
               
               {/* Source Node */}
               <div 
                 onClick={() => setActiveTopologyNode(NODE_DETAILS.base)}
                 className="z-10 bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-center shadow-sm w-28 shrink-0 cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all hover:-translate-y-0.5"
               >
                 <div className="font-bold text-emerald-800 text-sm">培育基地</div>
                 <div className="text-[10px] text-emerald-600 font-medium mt-0.5">库存: 12,500 株</div>
                 <div className="text-[10px] text-emerald-500 mt-1 bg-white rounded px-1 py-0.5 border border-emerald-100">大理野生芍药保护基地</div>
               </div>
               
               {/* Transit Node */}
               <div 
                 onClick={() => setActiveTopologyNode(NODE_DETAILS.transit)}
                 className="z-10 bg-blue-50 border border-blue-200 p-3 rounded-lg text-center shadow-sm w-28 shrink-0 relative cursor-pointer hover:shadow-md hover:border-blue-300 transition-all hover:-translate-y-0.5"
               >
                 <div className="font-bold text-blue-800 text-sm">中转集散中心</div>
                 <div className="text-[10px] text-blue-600 font-medium mt-0.5">库存: 5,200 株</div>
                 <div className="absolute -top-3 -right-2 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm hover:scale-110 transition-transform">周转率 92%</div>
               </div>
               
               {/* Destination Nodes */}
               <div className="z-10 flex flex-col justify-between h-full py-2 w-32 shrink-0 space-y-2">
                  <div 
                    onClick={() => setActiveTopologyNode(NODE_DETAILS.market)}
                    className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 transition-all hover:-translate-x-1"
                  >
                    <div className="font-bold text-slate-700 text-xs">花卉批发市场</div>
                    <div className="text-[10px] text-slate-500 flex justify-between mt-0.5"><span>昆明斗南</span> <span className="text-emerald-500 font-mono">2.1k 株</span></div>
                  </div>
                  <div 
                    onClick={() => setActiveTopologyNode(NODE_DETAILS.store)}
                    className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 transition-all hover:-translate-x-1"
                  >
                    <div className="font-bold text-slate-700 text-xs">授权专卖店</div>
                    <div className="text-[10px] text-slate-500 flex justify-between mt-0.5"><span>上海徐汇店</span> <span className="text-emerald-500 font-mono">1.5k 株</span></div>
                  </div>
                  <div 
                    onClick={() => setActiveTopologyNode(NODE_DETAILS.online)}
                    className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 transition-all hover:-translate-x-1"
                  >
                    <div className="font-bold text-slate-700 text-xs">生鲜平台前置仓</div>
                    <div className="text-[10px] text-slate-500 flex justify-between mt-0.5"><span>叮咚/盒马</span> <span className="text-emerald-500 font-mono">1.6k 株</span></div>
                  </div>
               </div>
               
            </div>
          </div>
        </div>

        <div key="lifecycle-sandbox" className="h-full flex flex-col pt-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')] drag-handle cursor-move">
            <div className="p-4 border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0 z-20 flex justify-between items-center rounded-t-xl">
               <div>
                 <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   <Layers className="w-5 h-5 text-indigo-600" /> 
                   芍药全生命周期数字化沙盘
                 </h3>
                 <p className="text-xs text-slate-500 mt-0.5">从种球入库、种植、采摘、物流到零售的全流程轨迹</p>
               </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
               <div className="relative">
                 {/* Connecting line */}
                 <div className="absolute top-8 left-10 right-10 h-1 bg-slate-200 rounded-full"></div>
                 {/* Nodes */}
                 <div className="relative flex justify-between">
                    <div className="flex flex-col items-center group cursor-pointer w-28">
                      <div className="w-16 h-16 bg-white rounded-full border-4 border-indigo-500 shadow-lg flex items-center justify-center z-10 hover:scale-110 transition-transform">
                         <FileBadge className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div className="mt-4 text-center bg-white p-2 rounded shadow-sm border border-slate-100 group-hover:border-indigo-200 transition-colors">
                        <p className="font-bold text-sm text-slate-700">种球入库</p>
                        <p className="text-[10px] text-slate-500 mt-1">组培与休眠打破</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center group cursor-pointer w-28">
                      <div className="w-16 h-16 bg-white rounded-full border-4 border-emerald-500 shadow-lg flex items-center justify-center z-10 hover:scale-110 transition-transform relative">
                         <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                         <Sprout className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="mt-4 text-center bg-white p-2 rounded shadow-sm border border-emerald-100 ring-2 ring-emerald-500/20">
                        <p className="font-bold text-sm text-emerald-700">大田培育</p>
                        <p className="text-[10px] text-emerald-600 mt-1">现蕾期 (当前)</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center group cursor-pointer w-28">
                      <div className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 shadow-sm flex items-center justify-center z-10 grayscale group-hover:grayscale-0 transition-all">
                         <CheckCircle2 className="w-6 h-6 text-slate-400 group-hover:text-amber-500" />
                      </div>
                      <div className="mt-4 text-center bg-slate-50 p-2 rounded border border-slate-100 text-slate-400 group-hover:text-amber-700 transition-colors">
                        <p className="font-bold text-sm">鲜切花采摘</p>
                        <p className="text-[10px] mt-1">分拣与冷藏预冷</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center group cursor-pointer w-28">
                      <div className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 shadow-sm flex items-center justify-center z-10 grayscale group-hover:grayscale-0 transition-all">
                         <MapPin className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                      </div>
                      <div className="mt-4 text-center bg-slate-50 p-2 rounded border border-slate-100 text-slate-400 group-hover:text-blue-700 transition-colors">
                        <p className="font-bold text-sm">冷链物流</p>
                        <p className="text-[10px] mt-1">恒温运输追踪</p>
                      </div>
                    </div>
                 </div>
                 
                 {/* Detail Card Overlay (Mock interaction) */}
                 <div className="mt-10 bg-white border border-emerald-200 rounded-xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <div className="flex items-start justify-between">
                       <div>
                         <h4 className="font-bold text-emerald-800 text-lg flex items-center gap-2"><ScanLine className="w-5 h-5" />大田培育阶段 - 详细数据</h4>
                         <p className="text-sm text-slate-500 mt-1">关联批次: OB-2023-11 (面积 12.5 亩)</p>
                       </div>
                       <button className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                    </div>
                    <div className="grid grid-cols-3 gap-6 mt-6">
                       <div>
                         <div className="text-xs text-slate-500 mb-2">投入品资源消耗折线</div>
                         <div className="h-32">
                           <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={yieldData.slice(0,4)}>
                                <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={{r:3}} />
                                <Tooltip />
                              </LineChart>
                           </ResponsiveContainer>
                         </div>
                       </div>
                       <div className="col-span-2">
                          <div className="text-xs text-slate-500 mb-2">农事执行日志关联</div>
                          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-2">
                             <div className="flex items-center justify-between text-sm">
                               <span className="flex items-center gap-1 text-slate-700"><CheckCircle className="w-4 h-4 text-emerald-500"/> 施用水溶肥 50kg</span>
                               <span className="text-slate-500 text-xs">2023-04-12 09:30</span>
                             </div>
                             <div className="flex items-center justify-between text-sm">
                               <span className="flex items-center gap-1 text-slate-700"><CheckCircle className="w-4 h-4 text-emerald-500"/> 大田除草作业</span>
                               <span className="text-slate-500 text-xs">2023-04-10 14:00</span>
                             </div>
                          </div>
                          <button className="mt-3 text-xs text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1">
                            查看完整区块加上链存证 <ChevronsRightLeft className="w-3 h-3" />
                          </button>
                       </div>
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        <div key="team-collaboration" className="h-full flex flex-col pt-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full drag-handle cursor-move">
            <div className="p-4 border-b border-indigo-100 bg-indigo-50 sticky top-0 z-20 flex justify-between items-center rounded-t-xl">
               <div>
                 <h3 className="font-bold text-indigo-800 flex items-center gap-2">
                   <Clock className="w-5 h-5 text-indigo-600" /> 
                   团队任务协作与工单看板
                 </h3>
               </div>
               <button className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-1 transition-colors">
                 <PenTool className="w-3.5 h-3.5" /> 发布农事工单
               </button>
            </div>
            <div className="flex-1 p-5 overflow-y-auto bg-slate-50 flex gap-4">
               {/* Todo Column */}
               <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
                  <div className="p-3 border-b border-slate-200 bg-slate-100 flex justify-between items-center font-bold text-slate-700 text-sm">
                     <span>待处理工单 <span className="bg-white px-1.5 rounded text-xs ml-1 text-slate-500">{farmTasks.length}</span></span>
                  </div>
                  <div className="p-3 space-y-3">
                     <AnimatePresence>
                     {farmTasks.map((task, i) => (
                       <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          key={task.id} 
                          className={`border p-3 rounded-lg relative group ${task.priority === 'urgency' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5'}`}
                       >
                          {task.priority === 'urgency' && <div className="absolute top-3 right-3 bg-red-100 text-red-600 px-1.5 rounded text-[10px] font-bold">紧急</div>}
                          <div className={`font-bold text-sm mb-1 ${task.priority === 'urgency' ? 'text-red-900' : 'text-slate-800'}`}>{task.title}</div>
                          <p className={`text-xs mb-3 ${task.priority === 'urgency' ? 'text-red-700' : 'text-slate-500'}`}>{task.desc}</p>
                          <div className="flex items-center justify-between">
                             <div className={`flex items-center gap-1.5 bg-white border px-2 py-0.5 rounded-full text-[10px] font-medium ${task.priority === 'urgency' ? 'border-red-100 text-red-800' : 'border-slate-100 text-slate-600'}`}>
                               <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${task.priority === 'urgency' ? 'bg-red-200' : 'bg-slate-200'}`}>
                                 {task.assignee.charAt(0)}
                               </div>
                               委派给: {task.assignee}
                             </div>
                             <button className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 font-bold transition-colors">一键催办</button>
                          </div>
                       </motion.div>
                     ))}
                     </AnimatePresence>
                  </div>
               </div>

               {/* In Progress Column */}
               <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
                  <div className="p-3 border-b border-slate-200 bg-blue-50 flex justify-between items-center font-bold text-blue-800 text-sm">
                     <span>执行中 <span className="bg-white px-1.5 rounded text-xs ml-1 text-blue-600">1</span></span>
                  </div>
                  <div className="p-3 space-y-3">
                     <div className="border border-slate-200 bg-white p-3 rounded-lg shadow-sm">
                        <div className="font-bold text-slate-800 text-sm mb-1">A区春白芍大雪素追肥</div>
                        <p className="text-xs text-slate-500 mb-3">施入磷酸二氢钾，已配比完成。</p>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                           <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
                        </div>
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full text-[10px] text-slate-600 font-medium">
                             <div className="w-4 h-4 bg-slate-300 rounded-full flex items-center justify-center text-[8px] font-bold text-white">张</div>
                             负责: 张华
                           </div>
                           <span className="text-[10px] text-blue-500 font-bold">45% 进度</span>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div key="gis-map" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full drag-handle cursor-move">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-slate-800 flex items-center gap-2">
                 <Map className="w-5 h-5 text-emerald-600" /> 
                 芍药圃GIS组培室分布表
               </h3>
               <div className="flex gap-2">
                 <button 
                   onClick={() => {
                     setIsDrawingFence(false);
                     setIsAnnotating(!isAnnotating);
                     if (!isAnnotating) {
                       setTimeout(() => {
                         setAnnotationAlarm('已圈选 C区-病害高发地块，相关工单已分发');
                         setFarmTasks(prev => [{ id: Date.now().toString(), title: 'C区-病害高发地块-灰霉病防治', desc: 'AI视觉诊断报告：疑似灰霉病初期。请立即前往C区进行人工复检，并执行对应的植保处方卷操作。', priority: 'urgency', assignee: '植保班组', status: 'todo' }, ...prev]);
                       }, 2500); 
                     } else {
                         setAnnotationAlarm(null);
                     }
                   }}
                   className={`text-[10px] px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${isAnnotating ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                 >
                   <MapPin className="w-3 h-3" />
                   {isAnnotating ? '取消圈选' : '区域协作标注'}
                 </button>
                 <button 
                   onClick={() => {
                     setIsAnnotating(false);
                     setIsDrawingFence(!isDrawingFence);
                     if (!isDrawingFence) {
                       setTimeout(() => {
                         setFenceAlarm('GPS-892');
                          
                            
                            
                            
                          
                       }, 4000); // Simulate alarm after 4s
                     } else {
                       setFenceAlarm(null);
                     }
                   }}
                   className={`text-[10px] px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${isDrawingFence ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                 >
                   <PenTool className="w-3 h-3" />
                   {isDrawingFence ? '取消绘制' : '绘制电子围栏'}
                 </button>
                 <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-medium">8个大棚</span>
               </div>
            </div>

            {/* Alarm banner */}
            {annotationAlarm && (
              <div className="mb-2 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] p-2 rounded-lg flex justify-between items-center animate-in slide-in-from-top-2">
                <span className="font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 
                  {annotationAlarm}
                </span>
                <button onClick={() => setAnnotationAlarm(null)} className="text-amber-500 hover:text-amber-700 bg-amber-100 px-2 py-0.5 rounded">确定</button>
              </div>
            )}
            {fenceAlarm && (
              <div className="mb-2 bg-red-50 text-red-600 border border-red-200 text-[10px] p-2 rounded-lg flex justify-between items-center animate-in slide-in-from-top-2">
                <span className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> 
                  警报：设备 {fenceAlarm} 超出设定围栏范围！
                  <span className="bg-red-200 text-red-800 px-1 py-0.5 rounded ml-2 font-medium">已推送至移动端App</span>
                </span>
                <button onClick={() => setFenceAlarm(null)} className="text-red-500 hover:text-red-700 bg-red-100 px-2 py-0.5 rounded">解除</button>
              </div>
            )}

            <div className={`flex-1 ${isDrawingFence ? 'cursor-crosshair border-indigo-400' : isAnnotating ? 'cursor-cell border-amber-400' : 'border-slate-200'} bg-slate-50 border rounded-xl relative overflow-hidden min-h-[120px] flex items-center justify-center transition-colors`}>
               <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#10b981 1px, transparent 1px)', backgroundSize: '15px 15px' }}></div>
               
               {isDrawingFence && (
                 <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                   <polygon points="20%,10% 80%,15% 85%,85% 15%,75%" fill="rgba(99, 102, 241, 0.1)" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4" />
                 </svg>
               )}
               
               {isAnnotating && (
                 <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[20%] left-[60%] w-[30%] h-[40%] bg-amber-400/20 border-2 border-amber-400 border-dashed rounded-lg animate-pulse flex items-center justify-center">
                       <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">已选定防区</span>
                    </div>
                 </div>
               )}

               {fenceAlarm && (
                  <div className="absolute top-[88%] left-[90%] group animate-bounce">
                    <div className="w-6 h-6 bg-red-500 border-2 border-red-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.8)]">
                      <AlertTriangle className="w-3 h-3 text-white" />
                    </div>
                  </div>
               )}

               <div className="absolute top-[20%] left-[15%] group">
                  <div className="w-10 h-10 bg-emerald-500/20 border-2 border-emerald-500 rounded flex items-center justify-center cursor-pointer hover:bg-emerald-500/40 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                    <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></div>
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">A区-春白芍组培</div>
               </div>

               <div className="absolute top-[40%] right-[30%] group">
                  <div className="w-14 h-10 bg-amber-500/20 border-2 border-amber-500 rounded flex items-center justify-center cursor-pointer hover:bg-amber-500/40 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                    <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse"></div>
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">C区-病害预警</div>
               </div>

               <div className="absolute bottom-[25%] left-[45%] group">
                  <div className="w-12 h-12 bg-blue-500/20 border-2 border-blue-500 rounded flex items-center justify-center cursor-pointer hover:bg-blue-500/40 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">B区-待出圃</div>
               </div>
            </div>
            <div className="flex gap-3 mt-3 h-4 justify-center text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> 正常繁育</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> 待出圃</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div> 预警</span>
            </div>
          </div>
        </div>

        <div key="ai-panel" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full drag-handle cursor-move">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-slate-800 flex items-center gap-2">
                 <Sparkles className="w-4 h-4 text-purple-600" /> 
                 自动溯源分析与周历
               </h3>
               <div className="flex gap-2">
                 <button 
                    onClick={handleAiPredict}
                    disabled={isPredicting}
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                 >
                   {isPredicting ? <><Loader2 className="w-3 h-3 animate-spin"/> 预测中</> : <><Calendar className="w-3 h-3"/> 预测</>}
                 </button>
                 <button 
                    onClick={handleAiAnalysis}
                    disabled={isAnalyzing}
                    className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                 >
                   {isAnalyzing ? <><Loader2 className="w-3 h-3 animate-spin"/> 分析中</> : '生成'}
                 </button>
               </div>
            </div>
            <div className="flex-1 flex gap-4 min-h-0">
              <div className="w-1/2 bg-gradient-to-br from-slate-50 to-purple-50/30 border border-slate-200 rounded-xl p-3 overflow-y-auto">
                 {aiReport ? (
                   <div className="text-[10px] leading-relaxed whitespace-pre-wrap text-slate-700">
                     {aiReport}
                   </div>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                     <Sparkles className="w-5 h-5 text-purple-200" />
                     <p className="text-[10px] text-center">点击生成报告</p>
                   </div>
                 )}
              </div>
              <div className="w-1/2 bg-gradient-to-br from-blue-50/30 to-blue-50/10 border border-blue-100 rounded-xl p-3 overflow-y-auto">
                 <h4 className="text-[10px] font-bold text-blue-800 mb-2 flex items-center gap-1.5">
                   <Calendar className="w-3 h-3" /> 预告
                 </h4>
                 {scheduleReport ? (
                   <div className="text-[10px] leading-relaxed whitespace-pre-wrap text-blue-900">
                     {scheduleReport}
                   </div>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-blue-300 space-y-2">
                     <Calendar className="w-5 h-5 opacity-50" />
                     <p className="text-[10px] text-center">点击预测<br/>获取建议</p>
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>
        <div key="geo-heatmap" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
            <h3 className="font-bold text-slate-800 mb-4 drag-handle cursor-move flex items-center gap-2">
              <Map className="w-5 h-5 text-indigo-500" />
              全球供应链与终端地理监控
            </h3>
            <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-100">
               <D3GeoMap />
            </div>
          </div>
        </div>

        <div key="anti-fake-monitor" className="h-full flex flex-col pt-1">
           <AntiFakeMonitor />
        </div>
        <div key="annual-performance" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full drag-handle cursor-move">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              年度种植绩效分析报告
            </h3>
            <div className="flex-1 min-h-0 w-full relative">
               <ResponsiveContainer width="100%" height="100%">
                 <RadarChart cx="50%" cy="50%" outerRadius="75%" data={[
                    { subject: '产出率', A: 120, B: 110, fullMark: 150 },
                    { subject: '成活率', A: 98, B: 130, fullMark: 150 },
                    { subject: '防虫抗病', A: 86, B: 130, fullMark: 150 },
                    { subject: '成本控制', A: 99, B: 100, fullMark: 150 },
                    { subject: '成品售价', A: 85, B: 90, fullMark: 150 },
                    { subject: '生长周期', A: 65, B: 85, fullMark: 150 },
                 ]}>
                   <PolarGrid stroke="#e2e8f0" />
                   <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} />
                   <PolarRadiusAxis angle={30} domain={[0, 150]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                   <Radar name="春白芍大雪素 (A区)" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                   <Radar name="素心紫凤朝阳 (B区)" dataKey="B" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                   <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                   <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                 </RadarChart>
               </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div key="rfid-monitor" className="h-full flex flex-col pt-1">
          <RfidMonitor />
        </div>
        <div key="yield-trend-30days" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center h-full">
            <h3 className="font-bold text-slate-800 text-sm mb-4">近30日采收产量趋势</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yieldTrendData}>
                  <defs>
                    <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={20} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="采收产量" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorYield)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div key="plot-comparison" className="h-full flex flex-col pt-1">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center h-full">
            <h3 className="font-bold text-slate-800 text-sm mb-4">不同地块产出与品质对比</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plotYieldData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="plot" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{fill: '#f1f5f9'}} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="优质产出" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="普通产出" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </ResponsiveGridLayout>

      {/* AI Assistant Sidebar */}
      {showAiSidebar && (
         <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
           <div className="p-4 border-b border-purple-100 bg-purple-50 flex justify-between items-center shrink-0">
             <h3 className="font-bold text-purple-900 flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-purple-600" />
               Gemini 种植顾问 & 肥料推荐
             </h3>
             <button onClick={() => setShowAiSidebar(false)} className="text-purple-400 hover:text-purple-600">
               <X className="w-5 h-5" />
             </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-sm text-slate-700 leading-relaxed">
                 <p className="font-bold text-slate-800 mb-2">欢迎使用自然语言检索！</p>
                 <p>您可以输入病态描述、气候变化或直接询问养护问题。系统将自动关联当前培育大棚进度，并为您生成 <span className="text-purple-600 font-bold">肥料与农药的推荐方案</span>。</p>
              </div>

              {aiChatQuery && aiChatResponse && (
                 <div className="space-y-3">
                   <div className="flex justify-end">
                      <div className="bg-purple-600 text-white p-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm">
                        {aiChatQuery}
                      </div>
                   </div>
                   <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm max-w-[95%] text-sm shadow-sm whitespace-pre-wrap">
                        <div className="flex items-center gap-1.5 text-purple-600 font-bold mb-2 pb-2 border-b border-slate-100">
                           <Sparkles className="w-4 h-4" /> 匹配到的专业方案
                        </div>
                        {aiChatResponse}
                        <button className="mt-3 w-full border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 font-medium py-1.5 rounded transition-colors text-xs flex justify-center gap-1 items-center">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 采纳推荐并下发至农事排班
                        </button>
                      </div>
                   </div>
                 </div>
              )}
           </div>

           <div className="p-4 border-t border-slate-200 bg-white shrink-0">
             <div className="relative">
               <textarea 
                 value={aiChatQuery}
                 onChange={(e) => setAiChatQuery(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleAiChat();
                   }
                 }}
                 placeholder="例：最近连续阴雨，春白芍需要追什么肥？"
                 className="w-full pl-3 pr-12 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm resize-none h-20"
               />
               <button 
                 onClick={handleAiChat}
                 disabled={isAiAnswering || !aiChatQuery.trim()}
                 className="absolute right-2 bottom-2 p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 transition-colors flex items-center justify-center shadow-sm"
               >
                 {isAiAnswering ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
               </button>
             </div>
           </div>
         </div>
      )}

      {/* Legacy modals remain unchanged... */}

      {/* Email Subscription Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-500" />
                周期性邮件推送订阅
              </h3>
              <button onClick={() => setIsEmailModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">接收人邮箱地址</label>
                <input type="email" placeholder="admin@orchid-chain.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">推送频率</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>每周五 18:00 (周报)</option>
                  <option>每月1号 08:00 (月报)</option>
                  <option>每天 08:00 (日报)</option>
                </select>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-100 text-sm">
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" defaultChecked className="rounded text-blue-500 focus:ring-blue-500" />
                  包含芍药批次库存预警数据
                </label>
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" defaultChecked className="rounded text-blue-500 focus:ring-blue-500" />
                  包含溯源分析与合规风控简报
                </label>
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" className="rounded text-blue-500 focus:ring-blue-500" />
                  附带 PDF 格式附件
                </label>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsEmailModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">取消</button>
              <button onClick={() => setIsEmailModalOpen(false)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm rounded-lg transition-colors">保存订阅设置</button>
            </div>
          </div>
        </div>
      )}
      {isPdfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                导出年度溯源决策报告 (经营简报 PDF)
              </h3>
              <button 
                onClick={() => setIsPdfModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-50 flex flex-col gap-6">
              
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-4">
                 <div className="flex-1">
                    <label className="block text-sm text-slate-800 mb-2 font-bold">目标年份</label>
                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                       <option>2026 年度</option>
                       <option>2025 年度</option>
                       <option>2024 年度</option>
                    </select>
                 </div>
                 <div className="flex-1">
                    <label className="block text-sm text-slate-800 mb-2 font-bold">目标地块 (支持多选汇编)</label>
                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                       <option>所有种植地块汇总</option>
                       <option>高山温室A区</option>
                       <option>露地B区</option>
                       <option>梯田C区</option>
                    </select>
                 </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                 <p className="text-sm text-slate-800 mb-4 font-bold">简报包含的深入对比模块项：</p>
                 <div className="grid grid-cols-2 gap-3 mb-2">
                   <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                     <input type="checkbox" defaultChecked className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                     种植周期：实际耗时与理想预设对比
                   </label>
                   <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                     <input type="checkbox" defaultChecked className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                     历史年度产量同比分析
                   </label>
                   <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                     <input type="checkbox" defaultChecked className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                     投入产出比雷达图洞察
                   </label>
                   <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                     <input type="checkbox" defaultChecked className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                     异常病虫害AI预警日历
                   </label>
                 </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                 <p className="text-sm text-slate-800 mb-4 font-bold">PDF版式自定义选项：</p>
                 <div className="flex gap-4">
                   <button 
                     onClick={() => setPdfLayout('standard')}
                     className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${pdfLayout === 'standard' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                   >
                     标准版式 <br/><span className="text-xs font-normal opacity-70">A4纵向，适合打印呈递</span>
                   </button>
                   <button 
                     onClick={() => setPdfLayout('presentation')}
                     className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${pdfLayout === 'presentation' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                   >
                     简报演示版式 <br/><span className="text-xs font-normal opacity-70">16:9横向，适合大屏汇报</span>
                   </button>
                 </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button 
                onClick={() => setIsPdfModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handlePdfExport}
                disabled={isExportingPdf}
                className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isExportingPdf ? <><Loader2 className="w-4 h-4 animate-spin"/> 生成合并 PDF 中...</> : '确认导出报告'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
