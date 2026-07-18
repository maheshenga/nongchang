import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  ImageIcon,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { FarmRecordSource, type BatchDeviation, type CreateFarmRecordDto } from '@nongchang/shared';
import { listBatches } from '../api/batches';
import {
  createFarmRecord,
  listFarmRecords,
  updateFarmRecordStatus,
  type FarmRecord,
  type ListFarmRecordsQuery,
} from '../api/farm-records';
import { listDeviations } from '../api/phenology';
import { useApi } from '../hooks/useApi';
import { fluentButton, fluentFocus, fluentInput, fluentSelect, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

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

const QUICK_TEMPLATES = [
  { title: '基肥施加', type: '施缓释肥', desc: '追施芍药专用缓释肥，补充微量元素。', material: '缓释肥 50kg', labor: 1.5 },
  { title: '滴灌管护', type: '温室浇水', desc: '完成A区常规温室喷洒浇水，控水控湿正常。', material: '水 2T', labor: 1 },
  { title: '抽芽修剪', type: '修剪整形', desc: '清理枯枝烂叶，修剪交叉枝以及过密处枝条，保持通风。', material: '无', labor: 2 },
];

const panelClass = 'border border-[#E1DFDD] bg-white';
const sectionHeaderClass = 'flex min-h-11 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3';
const labelClass = 'mb-1 block text-xs font-semibold text-[#605E5C]';
const modalInputClass = `${fluentInput} w-full`;
const checkboxTextClass = 'text-xs leading-5 text-[#605E5C]';

function toRecordTask(r: FarmRecord): RecordTask {
  const detail = r.detail ?? {};
  return {
    id: r.id,
    time: r.recordedAt.slice(0, 10),
    batch: r.batchId,
    type: r.action,
    desc: typeof detail.desc === 'string' ? detail.desc : r.action,
    person: r.operatorId.slice(0, 8),
    owner: r.ownerName ?? '-',
    status: r.status === 'pending' ? 'pending' : 'completed',
    material: typeof detail.material === 'string' ? detail.material : undefined,
    labor: typeof detail.labor === 'number' ? detail.labor : undefined,
    images: Array.isArray(r.images) ? r.images : [],
  };
}

function TaskCard({
  task,
  tone,
  onComplete,
}: {
  task: RecordTask;
  tone: 'pending' | 'completed';
  onComplete?: (id: string) => void;
}) {
  const completed = tone === 'completed';
  return (
    <article className={`${panelClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
            {completed ? <CheckCircle className="h-4 w-4 text-[#107C10]" /> : <CheckCircle2 className="h-4 w-4 text-[#0078D4]" />}
            <span className="truncate">{task.type}</span>
          </div>
          <div className="mt-1 text-xs text-[#605E5C]">归属商户: <span className="font-semibold text-[#323130]">{task.owner}</span></div>
        </div>
        <span className="shrink-0 border border-[#E1DFDD] bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-[#605E5C]">{task.batch}</span>
      </div>

      <p className="mt-3 text-sm leading-6 text-[#323130]">{task.desc}</p>
      <div className="mt-3 grid gap-2 border border-[#EDEBE9] bg-[#FAFAFA] p-3 text-xs text-[#605E5C] sm:grid-cols-2">
        <span>物资消耗: <span className="font-semibold text-[#323130]">{task.material || '无'}</span></span>
        <span>工时: <span className="font-semibold text-[#323130]">{task.labor || 0}小时</span></span>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-xs text-[#605E5C] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {task.time}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-[#EDEBE9] bg-white px-2 py-1">执行人: {task.person}</span>
          {!completed && onComplete && (
            <button
              type="button"
              aria-label={`标记完成 ${task.type}`}
              onClick={() => onComplete(task.id)}
              className={fluentButton('primary')}
            >
              <CheckCircle className="h-4 w-4" />
              标记完成
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function FarmRecords() {
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'completed'>('');
  const [query, setQuery] = useState<ListFarmRecordsQuery>({});
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTask, setNewTask] = useState({ type: '', desc: '', material: '', labor: 1, batch: '' });
  const [toastMessage, setToastMessage] = useState('');

  const fetchRecords = useCallback(() => listFarmRecords(query), [query]);
  const recordQueryKey = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  ).toString();
  const { data: rawRecords, loading, error, reload } = useApi<FarmRecord[]>(fetchRecords, {
    cacheKey: `farm-records:${recordQueryKey}`,
  });
  const { data: batches } = useApi(listBatches, { cacheKey: 'batches' });
  const { data: deviations } = useApi(listDeviations, { cacheKey: 'batch-deviations' });

  const tasks: RecordTask[] = (rawRecords ?? []).map(toRecordTask);
  const alertDeviations: BatchDeviation[] = (deviations ?? []).filter((d) => d.alert);
  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const galleryTasks = tasks.filter((task) => task.images.length > 0);

  useEffect(() => {
    if (alertDeviations.length > 0) {
      const event = new CustomEvent('farm-deviation-alert', {
        detail: { message: `${alertDeviations.length} 个批次生长周期偏离标准物候模型` },
      });
      window.dispatchEvent(event);
    }
  }, [alertDeviations.length]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  function applyFilters() {
    const next: ListFarmRecordsQuery = {};
    if (searchInput.trim()) next.action = searchInput.trim();
    if (statusFilter) next.status = statusFilter;
    setQuery(next);
  }

  const handleTemplateClick = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setNewTask({
      type: tpl.type,
      desc: tpl.desc,
      material: tpl.material,
      labor: tpl.labor,
      batch: newTask.batch,
    });
    showToast('已加载快捷模板');
  };

  const handleComplete = async (id: string) => {
    try {
      await updateFarmRecordStatus(id, 'completed');
      showToast('已完成并发布到公开溯源');
      void reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.type || !newTask.desc || !newTask.batch) {
      showToast('请输入完整的农事实操信息及批次号');
      return;
    }
    const batch = (batches ?? []).find((item) => item.id === newTask.batch);
    if (!batch) {
      showToast('请选择有效批次');
      return;
    }
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

  return (
    <div className="relative flex h-full flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      {alertDeviations.length > 0 && !dismissedAlert && (
        <div className="absolute right-4 top-4 z-[100] flex max-w-sm items-start gap-3 border border-[#F1B8BD] bg-[#FDE7E9] px-4 py-3 text-[#A4262C]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">生长周期偏离预警</h4>
            <p className="mt-1 text-xs leading-5">
              {alertDeviations.length} 个批次较标准物候模型偏离超阈值:
              {alertDeviations.slice(0, 3).map((d) => ` ${d.batchNo}(${d.cropName} 滞后${d.deviationDays}天)`).join('、')}
              {alertDeviations.length > 3 ? ' 等' : ''}
            </p>
          </div>
          <button type="button" aria-label="关闭偏离预警" onClick={() => setDismissedAlert(true)} className={fluentButton('icon')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <FileSpreadsheet className="h-5 w-5 text-[#0078D4]" />
            农事实操与质检记录看板
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
            记录由农户端与后台填报，已完成农事自动归档。
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={() => setShowCreateModal(true)} className={fluentButton('primary')}>
            <Sparkles className="h-4 w-4" />
            快捷农事实录
          </button>
          <button type="button" onClick={() => setViewMode('list')} className={fluentButton(viewMode === 'list' ? 'primary' : 'secondary')}>
            列表视图
          </button>
          <button type="button" onClick={() => setViewMode('gallery')} className={fluentButton(viewMode === 'gallery' ? 'primary' : 'secondary')}>
            影像库
          </button>
          <div>
            <label htmlFor="farm-record-status" className={labelClass}>状态筛选</label>
            <select
              id="farm-record-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'pending' | 'completed')}
              className={`${fluentSelect} w-32`}
            >
              <option value="">全部状态</option>
              <option value="pending">待完成</option>
              <option value="completed">已完成</option>
            </select>
          </div>
          <div>
            <label htmlFor="farm-record-search" className={labelClass}>按作业类型搜索</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
              <input
                id="farm-record-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                placeholder="按作业类型搜索..."
                className={`${fluentInput} w-48 pl-8`}
              />
            </div>
          </div>
          <button type="button" onClick={applyFilters} className={fluentButton('secondary')}>
            <Search className="h-4 w-4" />
            筛选
          </button>
        </div>
      </div>

      <div className="fluent-scrollbar min-h-0 flex-1 overflow-auto bg-[#F5F5F5] p-5">
        {loading && <LoadingState label="加载农事记录" className="w-full" />}
        {error && (
          <ErrorState title="农事记录加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" className="w-full" />
        )}

        {!loading && !error && viewMode === 'list' && (
          <div className="grid h-full min-h-[420px] gap-5 xl:grid-cols-2">
            <section className={`${panelClass} flex min-h-0 flex-col`}>
              <div className={sectionHeaderClass}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
                  <Clock className="h-4 w-4 text-[#0078D4]" />
                  待完成任务
                </h3>
                <div className="flex items-center gap-2">
                  <span className={fluentStatusTag('neutral')}>{pendingTasks.length}</span>
                  <button type="button" onClick={() => setShowCreateModal(true)} className={`${fluentButton('secondary')} xl:hidden`}>
                    新建记录
                  </button>
                </div>
              </div>
              <div className="fluent-scrollbar min-h-0 flex-1 space-y-3 overflow-auto p-4">
                {pendingTasks.length === 0 ? (
                  <EmptyState title="暂无待完成任务" description="新建农事记录后，待执行事项会出现在这里。" />
                ) : (
                  pendingTasks.map((task) => <TaskCard key={task.id} task={task} tone="pending" onComplete={handleComplete} />)
                )}
              </div>
            </section>

            <section className={`${panelClass} flex min-h-0 flex-col`}>
              <div className={sectionHeaderClass}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
                  <CheckCircle className="h-4 w-4 text-[#107C10]" />
                  已完成（已归档）
                </h3>
                <span className={fluentStatusTag('success')}>{completedTasks.length}</span>
              </div>
              <div className="fluent-scrollbar min-h-0 flex-1 space-y-3 overflow-auto p-4">
                {completedTasks.length === 0 ? (
                  <EmptyState title="暂无已完成记录" description="标记完成后的农事记录会归档到这里。" />
                ) : (
                  completedTasks.map((task) => <TaskCard key={task.id} task={task} tone="completed" />)
                )}
              </div>
            </section>
          </div>
        )}

        {!loading && !error && viewMode === 'gallery' && (
          <section className={`${panelClass} min-h-[420px]`}>
            <div className={sectionHeaderClass}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
                <ImageIcon className="h-4 w-4 text-[#0078D4]" />
                农事影像库
              </h3>
              <span className="text-xs text-[#605E5C]">展示带现场照片的农事记录</span>
            </div>
            <div className="p-5">
              {galleryTasks.length === 0 ? (
                <EmptyState title="暂无带现场照片的农事记录" description="上传图片后，现场照片会在这里集中查看。" />
              ) : (
                <div className="space-y-4">
                  {galleryTasks.map((task) => (
                    <article key={task.id} className={`${panelClass} p-4`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
                            <ImageIcon className="h-4 w-4 text-[#0078D4]" />
                            {task.type}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-[#605E5C]">{task.desc}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#605E5C]">
                          <span>归属商户: {task.owner}</span>
                          <span className={fluentStatusTag('neutral')}>{task.time}</span>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {task.images.map((url, index) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative aspect-square overflow-hidden border border-[#E1DFDD] bg-[#FAFAFA]"
                          >
                            <img src={url} alt={`${task.type} 现场照片 ${index + 1}`} className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {showCreateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="fr-modal-title" className="fluent-scrollbar flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto border border-[#E1DFDD] bg-white">
            <div className="flex min-h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-3">
              <h3 id="fr-modal-title" className="flex items-center gap-2 text-base font-semibold text-[#242424]">
                <FileSpreadsheet className="h-5 w-5 text-[#0078D4]" />
                快捷新建记录
              </h3>
              <button type="button" onClick={() => setShowCreateModal(false)} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section>
                <div className="mb-2 text-xs font-semibold text-[#605E5C]">常用农事模板（点击一键填充）</div>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_TEMPLATES.map((tpl) => (
                    <button key={tpl.title} type="button" onClick={() => handleTemplateClick(tpl)} className={`${fluentButton('secondary')} h-auto min-h-14 flex-col py-2 text-center text-xs`}>
                      <Sparkles className="h-4 w-4" />
                      {tpl.title}
                    </button>
                  ))}
                </div>
              </section>

              <div className="space-y-4">
                <div>
                  <label htmlFor="fr-batch" className={labelClass}>关联批次</label>
                  <select id="fr-batch" value={newTask.batch} onChange={(e) => setNewTask({ ...newTask, batch: e.target.value })} className={`${fluentSelect} w-full`}>
                    <option value="">请选择批次...</option>
                    {(batches ?? []).map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNo}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="fr-type" className={labelClass}>作业类型</label>
                  <input id="fr-type" type="text" value={newTask.type} onChange={(e) => setNewTask({ ...newTask, type: e.target.value })} className={modalInputClass} placeholder="例如：打药、采摘" />
                </div>
                <div>
                  <label htmlFor="fr-desc" className={labelClass}>执行描述</label>
                  <textarea id="fr-desc" rows={2} value={newTask.desc} onChange={(e) => setNewTask({ ...newTask, desc: e.target.value })} className={`${modalInputClass} h-auto min-h-20 py-2`} placeholder="填写具体的作业步骤和发现..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fr-material" className={labelClass}>物料消耗</label>
                    <input id="fr-material" type="text" value={newTask.material} onChange={(e) => setNewTask({ ...newTask, material: e.target.value })} className={modalInputClass} placeholder="例如：水2吨" />
                  </div>
                  <div>
                    <label htmlFor="fr-labor" className={labelClass}>预估工时</label>
                    <input id="fr-labor" type="number" step="0.5" value={newTask.labor} onChange={(e) => setNewTask({ ...newTask, labor: Number(e.target.value) })} className={modalInputClass} />
                  </div>
                </div>
              </div>
              <p className={checkboxTextClass}>保存后会写入真实农事记录接口，并在当前列表刷新。</p>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={() => setShowCreateModal(false)} className={fluentButton('secondary')}>取消</button>
              <button type="button" onClick={() => void handleCreateTask()} disabled={!newTask.type || !newTask.desc || !newTask.batch} className={fluentButton('primary')}>
                保存记录
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 border border-[#E1DFDD] bg-white px-5 py-3 text-sm font-semibold text-[#242424] ${fluentFocus}`}>
          <CheckCircle2 className="h-5 w-5 text-[#107C10]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
