import { FileSpreadsheet, Search, CheckCircle2, Clock, Calendar, CheckCircle, Sparkles, X, ImageIcon, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { listFarmRecords, createFarmRecord, updateFarmRecordStatus, type FarmRecord, type ListFarmRecordsQuery } from '../api/farm-records';
import { listBatches } from '../api/batches';
import { listDeviations } from '../api/phenology';
import { FarmRecordSource, type CreateFarmRecordDto, type BatchDeviation } from '@nongchang/shared';

type RecordTask = {
  id: string;
  time: string;
  batch: string;
  type: string;
  desc: string;
  person: string;
  owner: string;
  status: 'pending' | 'completed';
  material?: string;
  labor?: number;
  images: string[];
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
    owner: r.ownerName ?? '—',
    status: r.status === 'pending' ? 'pending' : 'completed',
    material: typeof detail.material === 'string' ? detail.material : undefined,
    labor: typeof detail.labor === 'number' ? detail.labor : undefined,
    images: Array.isArray(r.images) ? r.images : [],
  };
}

export default function FarmRecords() {
  // #7 搜索/筛选:输入 → 查询参数 → 后端过滤。
  const [searchInput, setSearchInput] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'completed'>('');
  const [query, setQuery] = useState<ListFarmRecordsQuery>({});

  const fetchRecords = useCallback(() => listFarmRecords(query), [query]);
  const { data: rawRecords, loading, error, reload } = useApi(fetchRecords);
  const { data: batches } = useApi(listBatches);
  const tasks: RecordTask[] = (rawRecords ?? []).map(toRecordTask);

  function applyFilters() {
    const next: ListFarmRecordsQuery = {};
    if (actionFilter.trim()) next.action = actionFilter.trim();
    if (statusFilter) next.status = statusFilter;
    setQuery(next);
  }

  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');

  // #5 偏离预警:对比标准物候模型,实时拉取真实偏离数据。
  const { data: deviations } = useApi(listDeviations);
  const alertDeviations: BatchDeviation[] = (deviations ?? []).filter((d) => d.alert);
  const [dismissedAlert, setDismissedAlert] = useState(false);

  useEffect(() => {
    if (alertDeviations.length > 0) {
      const event = new CustomEvent('farm-deviation-alert', {
        detail: { message: `${alertDeviations.length} 个批次生长周期偏离标准物候模型` },
      });
      window.dispatchEvent(event);
    }
  }, [alertDeviations.length]);

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

  // #1 状态流转:待完成 → 已完成(归档)。
  const handleComplete = async (id: string) => {
    try {
      await updateFarmRecordStatus(id, 'completed');
      showToast('已标记完成并归档');
      void reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
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
        status: 'pending',
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

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const galleryTasks = tasks.filter(t => t.images.length > 0);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">

      {/* #5 偏离预警:基于真实标准物候模型 */}
      {alertDeviations.length > 0 && !dismissedAlert && (
          <div className="absolute top-4 right-4 z-[100] bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-start gap-3 max-w-sm border border-red-500">
             <div className="bg-red-500 p-2 rounded-lg shrink-0">
               <AlertTriangle className="w-5 h-5 text-white" />
             </div>
             <div>
                <h4 className="font-bold text-sm mb-1 uppercase tracking-wider text-red-50">生长周期偏离预警</h4>
                <p className="text-xs text-red-100 leading-relaxed font-medium">
                  {alertDeviations.length} 个批次较标准物候模型偏离超阈值:
                  {alertDeviations.slice(0, 3).map((d) => ` ${d.batchNo}(${d.cropName} 滞后${d.deviationDays}天)`).join('、')}
                  {alertDeviations.length > 3 ? ' 等' : ''}
                </p>
             </div>
             <button onClick={() => setDismissedAlert(true)} className="text-red-200 hover:text-white shrink-0"><X className="w-5 h-5"/></button>
          </div>
      )}

      <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            农事实操与质检记录看板
          </h3>
          <p className="text-xs text-slate-500 mt-1">记录由农户端与后台填报，已完成农事自动归档</p>
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
              onClick={() => setViewMode('gallery')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'gallery' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              影像库
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | 'pending' | 'completed')}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">全部状态</option>
            <option value="pending">待完成</option>
            <option value="completed">已完成</option>
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setActionFilter(e.target.value); }}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="按作业类型搜索…"
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700"
            />
          </div>
          <button onClick={applyFilters} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            <Search className="w-4 h-4" />
            筛选
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
                <div className="mb-2 text-[10px] text-slate-500">归属商户: <span className="font-bold text-slate-700">{task.owner}</span></div>
                <p className="text-xs text-slate-600 mb-2">{task.desc}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3 bg-slate-50 p-1.5 rounded">
                  <span className="font-medium">物资消耗: {task.material || '无'}</span>
                  <span className="font-medium">工时: {task.labor || 0}小时</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {task.time}</span>
                  <div className="flex items-center gap-2">
                     <span className="font-medium px-2 py-1 bg-slate-50 rounded">执行人: {task.person}</span>
                     <button onClick={() => void handleComplete(task.id)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-bold transition-colors">
                       <CheckCircle className="w-3 h-3" /> 标记完成
                     </button>
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
            <h4 className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /> 已完成 (已归档)</h4>
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
                <div className="mb-2 text-[10px] text-slate-500">归属商户: <span className="font-bold text-slate-700">{task.owner}</span></div>
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
        ) : (
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm pb-10">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between z-10 sticky top-0 relative">
               <h4 className="font-bold text-slate-700 flex items-center gap-2">
                 <ImageIcon className="w-5 h-5 text-indigo-500" /> 农事影像库
               </h4>
               <span className="text-xs text-slate-500">展示带现场照片的农事记录</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
               {galleryTasks.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
                   <ImageIcon className="w-12 h-12 mb-3 opacity-40" />
                   <p className="text-sm">暂无带现场照片的农事记录</p>
                 </div>
               ) : (
                 galleryTasks.map((task) => (
                   <div key={task.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                     <div className="flex justify-between items-center mb-4">
                        <span className="font-bold text-slate-800 flex items-center gap-2">
                          <ImageIcon className="w-5 h-5 text-indigo-500" /> {task.type}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">归属商户: {task.owner}</span>
                          <span className="text-xs font-medium px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">{task.time}</span>
                        </div>
                     </div>
                     <p className="text-xs text-slate-600 mb-4">{task.desc}</p>
                     <div className="grid grid-cols-4 gap-4">
                        {task.images.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden group">
                            <img src={url} alt={`${task.type} 现场照片 ${i + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                          </a>
                        ))}
                     </div>
                   </div>
                 ))
               )}
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
           <div role="dialog" aria-modal="true" aria-labelledby="fr-modal-title" className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 id="fr-modal-title" className="font-bold text-slate-800 flex items-center gap-2">
                 <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                 快捷新建记录
               </h3>
               <button onClick={() => setShowCreateModal(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 p-1">
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
                   <label htmlFor="fr-batch" className="block text-xs font-medium text-slate-700 mb-1">关联批次</label>
                   <select id="fr-batch" value={newTask.batch} onChange={(e) => setNewTask({ ...newTask, batch: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                     <option value="">请选择批次…</option>
                     {(batches ?? []).map((b) => <option key={b.id} value={b.id}>{b.batchNo}</option>)}
                   </select>
                 </div>
                 <div>
                   <label htmlFor="fr-type" className="block text-xs font-medium text-slate-700 mb-1">作业类型</label>
                   <input id="fr-type" type="text" value={newTask.type} onChange={(e) => setNewTask({...newTask, type: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例如：打药、采摘" />
                 </div>
                 <div>
                   <label htmlFor="fr-desc" className="block text-xs font-medium text-slate-700 mb-1">执行描述</label>
                   <textarea id="fr-desc" rows={2} value={newTask.desc} onChange={(e) => setNewTask({...newTask, desc: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="填写具体的作业步骤和发现..."></textarea>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="fr-material" className="block text-xs font-medium text-slate-700 mb-1">物料消耗</label>
                      <input id="fr-material" type="text" value={newTask.material} onChange={(e) => setNewTask({...newTask, material: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例如：水2吨" />
                    </div>
                    <div>
                      <label htmlFor="fr-labor" className="block text-xs font-medium text-slate-700 mb-1">预估工时</label>
                      <input id="fr-labor" type="number" step="0.5" value={newTask.labor} onChange={(e) => setNewTask({...newTask, labor: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
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

      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
