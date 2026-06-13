import { FileSpreadsheet, Search, Filter, CheckCircle2, Clock, Calendar, CheckCircle, Sparkles, X, Loader2, Link as LinkIcon, ImageIcon, GitCompare, ChevronsRightLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { listFarmRecords, createFarmRecord, type FarmRecord } from '../api/farm-records';
import { listBatches } from '../api/batches';
import { FarmRecordSource, type CreateFarmRecordDto } from '@nongchang/shared';

type RecordTask = {
  id: string;
  time: string;
  batch: string;
  type: string;
  desc: string;
  person: string;
  icon: any;
  status: 'pending' | 'completed';
  material?: string;
  labor?: number;
};

function toRecordTask(r: FarmRecord): RecordTask {
  const detail = r.detail ?? {};
  return {
    id: r.id,
    time: r.recordedAt.slice(0, 10),
    batch: r.batchId,
    type: r.action,
    desc: typeof detail.desc === 'string' ? detail.desc : r.action,
    person: r.operatorId.slice(0, 8),
    icon: undefined,
    status: 'completed',
    material: typeof detail.material === 'string' ? detail.material : undefined,
    labor: typeof detail.labor === 'number' ? detail.labor : undefined,
  };
}

export default function FarmRecords() {
  const { data: rawRecords, loading, error, reload } = useApi(listFarmRecords);
  const { data: batches } = useApi(listBatches);
  const tasks: RecordTask[] = (rawRecords ?? []).map(toRecordTask);

  // Encyclopedia Search State
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const [viewMode, setViewMode] = useState<'list' | 'gantt' | 'gallery' | 'knowledge-graph'>('list');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [deviationAlert, setDeviationAlert] = useState<string | null>(null);
  const [scheduleReminders, setScheduleReminders] = useState<{id: string, text: string}[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTask, setNewTask] = useState({ type: '', desc: '', material: '', labor: 1, batch: '' });

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const QUICK_TEMPLATES = [
    { title: '基肥施加', type: '施缓释肥', desc: '追施芍药专用缓释肥，补充微量元素。', material: '缓释肥 50kg', labor: 1.5 },
    { title: '滴灌管护', type: '温室浇水', desc: '完成A区常规温室喷洒浇水，控水控湿正常。', material: '水 2T', labor: 1 },
    { title: '抽芽修剪', type: '修剪整形', desc: '清理枯枝烂叶，修剪交叉枝以及过密处枝条，保持通风。', material: '无', labor: 2 },
  ];

  const handleTemplateClick = (tpl: typeof QUICK_TEMPLATES[0]) => {
     setNewTask({
        type: tpl.type,
        desc: tpl.desc,
        material: tpl.material,
        labor: tpl.labor,
        batch: newTask.batch
     });
     showToast('已加载快捷模板');
  };

  const handleCreateTask = async () => {
    if (!newTask.type || !newTask.desc || !newTask.batch) {
      return showToast('请输入完整的农事实操信息及批次号');
    }
    const batch = (batches ?? []).find((b) => b.id === newTask.batch);
    if (!batch) return showToast('请选择有效批次');
    try {
      const dto: CreateFarmRecordDto = {
        batchId: batch.id,
        fieldId: batch.fieldId,
        action: newTask.type,
        detail: { desc: newTask.desc, material: newTask.material, labor: newTask.labor },
        recordedAt: new Date().toISOString(),
        source: FarmRecordSource.WEB,
      };
      await createFarmRecord(dto);
      setShowCreateModal(false);
      setNewTask({ type: '', desc: '', material: '', labor: 1, batch: '' });
      showToast('农事记录已保存');
      void reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败');
    }
  };

  
  useEffect(() => {
    const timer = setTimeout(() => {
      setScheduleReminders(prev => [...prev, { id: 'rem1', text: '【智能排期提醒】根据大雪素生长模型及近期气候，推荐李建国在今日14:00前完成[温室浇水]。' }]);
      setDeviationAlert('【监控预警】高山温室A区【春白芍】休眠促花周期异常，较标准生长历程偏离超过 15%，请立即干预排期！');
      
      // Dispatch global event for Dashboard
      const event = new CustomEvent('farm-deviation-alert', { 
        detail: { message: '高山温室A区【春白芍】休眠促花周期异常，偏离标准 >15%' }
      });
      window.dispatchEvent(event);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const [ganttTasks, setGanttTasks] = useState([
    { id: '1', name: '土壤深耕与基肥', start: 0, duration: 15, color: 'bg-amber-500' },
    { id: '2', name: '种球消毒分株', start: 10, duration: 10, color: 'bg-emerald-500' },
    { id: '3', name: '大田定植', start: 20, duration: 15, color: 'bg-blue-500' },
    { id: '4', name: '初春浇水保墒', start: 35, duration: 25, color: 'bg-cyan-500' },
    { id: '5', name: '花大蕾期追肥', start: 60, duration: 10, color: 'bg-purple-500' },
    { id: '6', name: '炭疽病/介壳虫防治', start: 50, duration: 30, color: 'bg-red-500' },
    { id: '7', name: '鲜切花采摘包装', start: 90, duration: 10, color: 'bg-indigo-500' },
  ]);

  const handleGanttDrag = (id: string, e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', id);
  };

  const handleGanttDrop = (offsetMs: number, e: React.DragEvent) => {
    const id = e.dataTransfer.getData('taskId');
    if (!id) return;
    setGanttTasks(prev => {
      const newTasks = prev.map(t => {
        if(t.id === id) {
          const newStart = Math.max(0, t.start + (offsetMs / window.innerWidth) * 100);
          return { ...t, start: newStart };
        }
        return t;
      });
      
      // Auto checking logic
      const droppedTask = newTasks.find(t => t.id === id);
      if (droppedTask && (droppedTask.start + droppedTask.duration > 105 || droppedTask.start < 0)) {
         setDeviationAlert(`警告：[${droppedTask.name}] 的种植实施周期严重偏离预设大纲模型规划值！请管理员及时介入审核！`);
         
         const event = new CustomEvent('farm-deviation-alert', { 
           detail: { message: `高山温室A区【${droppedTask.name}】操作异常，严重超期偏离。` }
         });
         window.dispatchEvent(event);
         
         setTimeout(() => setDeviationAlert(null), 8000);
      }
      return newTasks;
    });
  };

  const handleEncyclopediaSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    // Simulate AI response for common peony diseases since there's no real backend yet
    setTimeout(() => {
      const q = searchQuery.toLowerCase();
      let result = '';
      if (q.includes('炭疽病')) {
        result = "芍药炭疽病主要危害叶、茎、花。防治方法：\n1. 及时清除病叶残株并集中销毁。\n2. 发病初期可喷洒 50%多菌灵可湿性粉剂800倍液或 70%甲基托布津1000倍液。\n3. 注意通风透光，降低湿度。";
      } else if (q.includes('根腐病')) {
        result = "芍药根腐病是由真菌引起的土壤传播病害。防治方法：\n1. 避免重茬，实行轮作。\n2. 栽植前拔除病株，用 1%硫酸铜或 70%高锰酸钾1000倍液浸根。\n3. 加强田间排水，防止积水。";
      } else if (q.includes('灰霉病')) {
        result = "芍药灰霉病常在多雨季节发生。防治方法：\n1. 出现病斑时及时剪除。\n2. 用 50%速克灵可湿性粉剂1500倍液喷洒，每隔7-10天一次。\n3. 控制氮肥施用，增施磷钾肥以增强抗病力。";
      } else if (q.includes('蚜虫')) {
        result = "芍药蚜虫群集在嫩梢、花蕾上吸食汁液。防治方法：\n1. 发现少量时可用水冲洗。\n2. 喷洒 10%吡虫啉可湿性粉剂2000倍液或 3%啶虫脒乳油1500倍液。\n3. 保护和利用天敌，如瓢虫、草蛉等。";
      } else {
        result = `基于农业知识库的大模型对“${searchQuery}”的专家诊断：\n建议您：\n1. 尽快将相关样本送至农业技术推广站。\n2. 增加土壤有机质成分，提高植物自体抗逆性。\n3. 采用物理隔离手段，如搭建防虫网或遮阳网。`;
      }
      setSearchResult(result);
      setIsSearching(false);
    }, 1200);
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
      
      {/* Auto Check Alert Popup */}
      {deviationAlert && (
          <div className="absolute top-4 right-4 z-[100] bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl animate-in fade-in zoom-in slide-in-from-top flex items-start gap-3 max-w-sm border border-red-500">
             <div className="bg-red-500 p-2 rounded-lg shrink-0">
               <Calendar className="w-5 h-5 text-white" />
             </div>
             <div>
                <h4 className="font-bold text-sm mb-1 uppercase tracking-wider text-red-50">种植周期偏离重大预警</h4>
                <p className="text-xs text-red-100 leading-relaxed font-medium">{deviationAlert}</p>
             </div>
             <button onClick={() => setDeviationAlert(null)} className="text-red-200 hover:text-white shrink-0"><X className="w-5 h-5"/></button>
          </div>
      )}

      {/* Smart Schedule Reminders */}
      {scheduleReminders.length > 0 && (
         <div className="absolute top-4 right-4 z-[90] flex flex-col gap-2">
            {scheduleReminders.map(rem => (
                <div key={rem.id} className="bg-indigo-600 text-white px-5 py-3 rounded-xl shadow-xl animate-in slide-in-from-right fade-in flex items-start gap-3 max-w-sm border border-indigo-500">
                    <div className="bg-indigo-500 p-1.5 rounded-lg shrink-0">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                       <h4 className="font-bold text-sm mb-0.5 text-indigo-50">待办农事智能推送</h4>
                       <p className="text-xs text-indigo-100 leading-relaxed font-medium">{rem.text}</p>
                    </div>
                    <button onClick={() => setScheduleReminders(prev => prev.filter(r => r.id !== rem.id))} className="text-indigo-200 hover:text-white shrink-0"><X className="w-4 h-4"/></button>
                </div>
            ))}
         </div>
      )}

      <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            农事实操与质检记录看板
          </h3>
          <p className="text-xs text-slate-500 mt-1">支持拖拽改变任务状态，移入「已完成」将自动打上时间戳并上链</p>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm mr-2 hidden md:flex">
             <Sparkles className="w-4 h-4" /> 快捷农事实录
          </button>
          
          <div className="relative flex items-center bg-slate-200/60 p-0.5 rounded-lg border border-slate-300 mr-2">
            <button 
              onClick={() => setViewMode('list')} 
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              列表视图
            </button>
            <button 
              onClick={() => setViewMode('gantt')} 
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'gantt' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              甘特图视图
            </button>
            <button 
              onClick={() => setViewMode('gallery')} 
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'gallery' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              影像库
            </button>
            <button 
              onClick={() => setViewMode('knowledge-graph')} 
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${viewMode === 'knowledge-graph' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <GitCompare className="w-4 h-4 text-purple-500" /> 知识图谱
            </button>
          </div>

          <button 
             onClick={() => setShowEncyclopedia(true)}
             className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded text-sm font-medium hover:bg-purple-100 transition-colors"
          >
             <Sparkles className="w-4 h-4" />
             AI植保百科
          </button>
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="搜索记录或执行人..." className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700" />
          </div>
          <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded text-sm font-medium transition-colors border border-slate-300">
            <Filter className="w-4 h-4" />
            筛选条件
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden p-5 bg-slate-50 flex gap-6 relative">
        
        {viewMode === 'list' ? (
          <>
            {loading && <div className="w-full p-8 text-center text-slate-400 text-sm">加载中…</div>}
            {error && <div className="w-full p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
            {/* Pending Column */}
            <div
              className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
            >
          <div className="p-4 border-b border-slate-200 bg-slate-100 flex items-center justify-between">
            <h4 className="font-bold text-slate-700 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> 待完成任务</h4>
            <div className="flex items-center gap-2">
               <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">{pendingTasks.length}</span>
               <button onClick={() => setShowCreateModal(true)} className="md:hidden text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold border border-emerald-200">+ 新建记录</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {task.type}
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{task.batch}</span>
                </div>
                <p className="text-xs text-slate-600 mb-2">{task.desc}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3 bg-slate-50 p-1.5 rounded">
                  <span className="font-medium">物资消耗: {task.material || '无'}</span>
                  <span className="font-medium">工时: {task.labor || 0}小时</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {task.time}</span>
                  <div className="flex items-center gap-2">
                     <span className="font-medium px-2 py-1 bg-slate-50 rounded">执行人: {task.person}</span>
                  </div>
                </div>
              </div>
            ))}
            {pendingTasks.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-10 border-2 border-dashed border-slate-200 rounded-lg">暂无待完成任务</div>
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div
          className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
        >
          <div className="p-4 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between">
            <h4 className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /> 已完成 (已上链)</h4>
            <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-bold">{completedTasks.length}</span>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="bg-slate-50 border border-slate-200 p-4 rounded-lg shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group opacity-80 hover:opacity-100"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 line-through decoration-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" />
                    {task.type}
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{task.batch}</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">{task.desc}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3 bg-white p-1.5 rounded border border-slate-100">
                  <span className="font-medium">物资消耗: {task.material || '无'}</span>
                  <span className="font-medium">工时: {task.labor || 0}小时</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium"><Clock className="w-3 h-3 text-emerald-500" /> {task.time}</span>
                  <div className="flex items-center gap-2">
                     <span className="font-medium px-2 py-1 bg-white rounded border border-slate-100">质检/执行: {task.person}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        ) : viewMode === 'gantt' ? (
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm pb-10">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between z-10 sticky top-0 relative">
               <h4 className="font-bold text-slate-700 flex items-center gap-2">
                 全年农事周期安排 (种植/施肥/除虫/采摘) 
               </h4>
               <span className="text-xs text-slate-500">提示: 可水平拖动任务卡片调整起始日期</span>
            </div>
            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden relative"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleGanttDrop(e.nativeEvent.offsetX, e)}
            >
               {/* Gantt Timeline Grid */}
               <div className="absolute top-0 bottom-0 left-[12%] right-0 border-l border-slate-200 pointer-events-none flex justify-between">
                 {[1,2,3,4,5,6].map(i => (
                   <div key={i} className="h-full border-r border-slate-100 w-1/6 relative">
                     <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400">第 {i} 月</div>
                   </div>
                 ))}
               </div>

               <div className="relative z-10 pt-10 pb-4 px-4">
                 {ganttTasks.map((t) => (
                   <div key={t.id} className="flex items-center mb-4 h-10 group">
                      <div className="w-[12%] shrink-0 text-xs font-bold text-slate-600 pr-2 flex justify-end">
                        {t.name}
                      </div>
                      <div className="flex-1 h-full relative cursor-ew-resize">
                        <div 
                          draggable
                          onDragStart={(e) => handleGanttDrag(t.id, e)}
                          onDragEnd={(e) => handleGanttDrop(e.nativeEvent.offsetX, e)}
                          className={`absolute top-1 bottom-1 ${t.color} rounded-md shadow-sm transition-all hover:brightness-110 flex items-center px-2 hover:ring-2 hover:ring-slate-300 hover:-translate-y-0.5 active:grayscale ease-in-out`}
                          style={{ left: `${t.start}%`, width: `${t.duration}%` }}
                        >
                          <span className="text-[10px] text-white/90 font-medium whitespace-nowrap overflow-hidden text-ellipsis">预计 duration</span>
                        </div>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm pb-10">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between z-10 sticky top-0 relative">
               <h4 className="font-bold text-slate-700 flex items-center gap-2">
                 种植影像库 (高清传感器抓拍)
               </h4>
               <span className="text-xs text-slate-500">左右滑动对比不同生长阶段的植株健康状况</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-8">
               <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex justify-between items-center mb-4">
                     <span className="font-bold text-slate-800 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-indigo-500"/> 批次 OB-2023-11: 春白芍大雪素</span>
                     <span className="text-sm font-medium px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">当前阶段: 现蕾期</span>
                  </div>
                  
                  {/* Image Comparison Slider */}
                  <div className="relative w-full h-[400px] bg-slate-100 rounded-lg overflow-hidden select-none border border-slate-200"
                       onMouseMove={(e) => {
                         const rect = e.currentTarget.getBoundingClientRect();
                         const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                         setSliderPosition((x / rect.width) * 100);
                       }}
                       onTouchMove={(e) => {
                         const rect = e.currentTarget.getBoundingClientRect();
                         const x = Math.max(0, Math.min(rect.width, e.touches[0].clientX - rect.left));
                         setSliderPosition((x / rect.width) * 100);
                       }}>
                     {/* Image 1: Past */}
                     <div className="absolute inset-0 w-full h-full object-cover">
                       <img src="https://images.unsplash.com/photo-1590459526702-8a9d1d6a89c3?auto=format&fit=crop&q=80&w=800" alt="3 weeks ago" className="w-full h-full object-cover grayscale opacity-80" />
                       <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded text-xs font-medium backdrop-blur-sm z-10">3周前 (展叶期)</div>
                     </div>
                     {/* Image 2: Present (Clipped) */}
                     <div className="absolute inset-0 w-full h-full object-cover shadow-[inset_1px_0_0_rgba(255,255,255,0.5)]" style={{ clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)` }}>
                       <img src="https://images.unsplash.com/photo-1590459526702-8a9d1d6a89c3?auto=format&fit=crop&q=80&w=800" alt="Present" className="w-full h-full object-cover saturate-150" />
                       <div className="absolute bottom-4 left-4 bg-white/90 text-slate-800 px-3 py-1 rounded text-xs font-bold backdrop-blur-sm shadow-sm z-10 border border-slate-200">今天 (现蕾期)</div>
                     </div>
                     {/* Slider Handle */}
                     <div className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_4px_rgba(0,0,0,0.5)] hover:w-2 transition-all flex items-center justify-center translate-x-[-50%]" style={{ left: `${sliderPosition}%` }}>
                       <div className="w-8 h-8 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform">
                          <ChevronsRightLeft className="w-4 h-4 text-slate-500" />
                       </div>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 mt-6">
                     {[1,2,3,4].map((i) => (
                       <div key={i} className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden group">
                         <img src={`https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=200&h=200`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                         <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-900/80 to-transparent p-2">
                           <span className="text-[10px] text-white">2023-04-1{i} 传感器 {i}号</span>
                         </div>
                       </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm pb-10">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between z-10 sticky top-0 relative">
               <h4 className="font-bold text-slate-700 flex items-center gap-2">
                 病虫害植保知识图谱 & AI视觉诊断
               </h4>
               <span className="text-xs text-slate-500">上传病害叶片图片，AI对比图谱一键生成防治方案</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex gap-6">
               {/* Left: Upload and Diagnostics */}
               <div className="w-1/3 flex flex-col gap-4">
                 <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center bg-white text-center hover:bg-slate-50 transition-colors cursor-pointer">
                   <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                     <ImageIcon className="w-6 h-6 text-purple-600" />
                   </div>
                   <p className="font-bold text-sm text-slate-700">拖拽或点击上传病害影像</p>
                   <p className="text-xs text-slate-500 mt-1">支持 JPG/PNG 高清图源</p>
                 </div>
                 
                 <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden flex-1">
                   <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
                   <h5 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                     <Sparkles className="w-4 h-4 text-purple-600" /> AI 视觉诊断报告
                   </h5>
                   <img src="https://images.unsplash.com/photo-1590459526702-8a9d1d6a89c3?auto=format&fit=crop&q=80&w=400" className="w-full h-32 object-cover rounded-lg mb-4" />
                   <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-500">关联病态形态</span>
                        <span className="font-bold text-red-600">叶斑病 / 炭疽病初期</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-500">图谱相似度匹配</span>
                        <span className="font-bold text-purple-600 font-mono">94.2%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">扩散危险等级</span>
                        <span className="font-bold text-amber-600">中等 (需干预)</span>
                      </div>
                   </div>
                   <button className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg text-sm shadow-sm transition-colors flex items-center justify-center gap-2">
                     <FileSpreadsheet className="w-4 h-4" /> 一键生成植保防治处方卷
                   </button>
                 </div>
               </div>
               
               {/* Right: Knowledge Graph Vis */}
               <div className="flex-1 bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative">
                  <h5 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                     <GitCompare className="w-4 h-4 text-blue-500" /> 植保知识图谱拓扑
                  </h5>
                  <div className="absolute top-16 bottom-5 left-5 right-5 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden flex items-center justify-center">
                     <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '15px 15px' }}></div>
                     {/* Mock graph drawing */}
                     <svg className="absolute inset-0 w-full h-full pointer-events-none origin-center scale-90">
                        {/* Lines */}
                        <line x1="50%" y1="50%" x2="20%" y2="30%" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4" />
                        <line x1="50%" y1="50%" x2="80%" y2="25%" stroke="#cbd5e1" strokeWidth="2" />
                        <line x1="50%" y1="50%" x2="25%" y2="75%" stroke="#cbd5e1" strokeWidth="2" />
                        <line x1="50%" y1="50%" x2="70%" y2="80%" stroke="#a78bfa" strokeWidth="3" />
                        
                        {/* Nodes */}
                        <circle cx="50%" cy="50%" r="40" fill="#f8fafc" stroke="#6366f1" strokeWidth="4" />
                        <text x="50%" y="50%" textAnchor="middle" dy=".3em" className="text-xs font-bold font-sans fill-slate-700">叶片褐斑</text>
                        
                        <circle cx="20%" cy="30%" r="28" fill="#fef2f2" stroke="#f87171" strokeWidth="2" />
                        <text x="20%" y="30%" textAnchor="middle" dy=".3em" className="text-[10px] font-medium fill-slate-700">芍药红斑病</text>
                        
                        <circle cx="80%" cy="25%" r="30" fill="#f0fdf4" stroke="#4ade80" strokeWidth="2" />
                        <text x="80%" y="25%" textAnchor="middle" dy=".3em" className="text-[10px] font-medium fill-slate-700">环境缺钾</text>
                        
                        <circle cx="25%" cy="75%" r="32" fill="#fffbeb" stroke="#fbbf24" strokeWidth="2" />
                        <text x="25%" y="75%" textAnchor="middle" dy=".3em" className="text-[10px] font-medium fill-slate-700">介壳虫吸汁</text>
                        
                        {/* Highlighted match node */}
                        <circle cx="70%" cy="80%" r="36" fill="#faf5ff" stroke="#a78bfa" strokeWidth="3" className="animate-pulse" />
                        <text x="70%" y="80%" textAnchor="middle" dy=".3em" className="text-xs font-bold fill-purple-900">芍药炭疽病</text>
                        
                        <rect x="62%" y="85%" width="16%" height="28" rx="4" fill="#a78bfa" opacity="0.9" />
                        <text x="70%" y="85%" textAnchor="middle" dy="18" className="text-[10px] font-bold fill-white">用药: 代森锰锌</text>
                     </svg>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
           <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-slate-800 flex items-center gap-2">
                 <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                 快捷新建记录
               </h3>
               <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                 <X className="w-5 h-5" />
               </button>
             </div>
             
             <div className="p-5 overflow-y-auto">
               <div className="mb-5">
                 <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                   常用农事模板 (点击一键填充)
                 </label>
                 <div className="grid grid-cols-3 gap-2">
                   {QUICK_TEMPLATES.map((tpl, i) => (
                     <button 
                       key={i}
                       onClick={() => handleTemplateClick(tpl)}
                       className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-xs font-bold px-2 py-2 rounded-lg transition-colors flex flex-col items-center gap-1 justify-center text-center shadow-sm"
                     >
                       <Sparkles className="w-4 h-4 opacity-70" />
                       {tpl.title}
                     </button>
                   ))}
                 </div>
               </div>

               <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-medium text-slate-700 mb-1">关联批次</label>
                   <select value={newTask.batch} onChange={(e) => setNewTask({ ...newTask, batch: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                     <option value="">请选择批次…</option>
                     {(batches ?? []).map((b) => <option key={b.id} value={b.id}>{b.batchNo}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-slate-700 mb-1">作业类型</label>
                   <input type="text" value={newTask.type} onChange={(e) => setNewTask({...newTask, type: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例如：打药、采摘" />
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-slate-700 mb-1">执行描述</label>
                   <textarea rows={2} value={newTask.desc} onChange={(e) => setNewTask({...newTask, desc: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="填写具体的作业步骤和发现..."></textarea>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">物料消耗</label>
                      <input type="text" value={newTask.material} onChange={(e) => setNewTask({...newTask, material: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例如：水2吨" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">预估工时</label>
                      <input type="number" step="0.5" value={newTask.labor} onChange={(e) => setNewTask({...newTask, labor: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                 </div>
               </div>
             </div>

             <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
               <button onClick={() => setShowCreateModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">取消</button>
               <button onClick={handleCreateTask} disabled={!newTask.type || !newTask.desc || !newTask.batch} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors">保存记录</button>
             </div>
           </div>
        </div>
      )}

      {/* Encyclopedia Side Panel */}
      {showEncyclopedia && (
         <div className="absolute top-0 right-0 bottom-0 w-[450px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
           <div className="p-4 border-b border-purple-100 bg-purple-50 flex justify-between items-center shrink-0">
             <h3 className="font-bold text-purple-900 flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-purple-600" />
               Gemini AI 植保百科检索
             </h3>
             <button onClick={() => setShowEncyclopedia(false)} className="text-purple-400 hover:text-purple-600">
               <X className="w-5 h-5" />
             </button>
           </div>
           
           <div className="p-5 border-b border-slate-100 shrink-0">
             <div className="flex gap-2">
               <input 
                 type="text" 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleEncyclopediaSearch()}
                 placeholder="输入病态名称 (例如: 炭疽病、介壳虫)"
                 className="flex-1 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm"
               />
               <button 
                 onClick={handleEncyclopediaSearch}
                 disabled={isSearching || !searchQuery.trim()}
                 className="px-4 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50 transition-colors flex items-center gap-2 text-sm"
               >
                 {isSearching ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
                 AI 检索
               </button>
             </div>
           </div>

           <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
              {searchResult ? (
                 <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                   {searchResult}
                   <div className="mt-5 border-t border-slate-100 pt-4 flex justify-between items-center text-xs">
                     <span className="text-slate-400">由 Gemini 3.5 Flash 视觉模型提供支持</span>
                     <button className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium">
                       <LinkIcon className="w-3 h-3" /> 点击作为引用记录
                     </button>
                   </div>
                 </div>
              ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                   <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
                     <Sparkles className="w-8 h-8 text-purple-300" />
                   </div>
                   <p className="text-sm">支持快速生成定制化的芍药综合防治方案</p>
                 </div>
              )}
           </div>
         </div>
      )}
      
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
