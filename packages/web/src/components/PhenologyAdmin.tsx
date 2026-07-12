import { useState } from 'react';
import { Sprout, Plus, Trash2, Loader2, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { listPhenologies, createPhenology, deletePhenology } from '../api/phenology';
import type { CreateCropPhenologyDto, CropPhenologyItem } from '@nongchang/shared';
import { confirmDialog } from '../hooks/useDialog';
import { showToast } from '../hooks/useToast';
import { fluentButton, fluentInput, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 标准物候模型管理:按作物维护各生长阶段的预设累计天数,作为批次偏离预警的基准。
export default function PhenologyAdmin() {
  const { data, loading, error, reload } = useApi(listPhenologies, { cacheKey: 'phenologies' });
  const items: CropPhenologyItem[] = data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ cropName: '', stage: '', expectedDays: 30, sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const grouped = items.reduce<Record<string, CropPhenologyItem[]>>((acc, it) => {
    (acc[it.cropName] ??= []).push(it);
    return acc;
  }, {});

  async function handleCreate() {
    if (!form.cropName.trim() || !form.stage.trim()) {
      setFormErr('请填写作物名称与阶段');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      const dto: CreateCropPhenologyDto = {
        cropName: form.cropName.trim(),
        stage: form.stage.trim(),
        expectedDays: Number(form.expectedDays),
        sortOrder: Number(form.sortOrder),
      };
      await createPhenology(dto);
      setShowModal(false);
      setForm({ cropName: '', stage: '', expectedDays: 30, sortOrder: 0 });
      showToast('已新增物候阶段');
      void reload();
    } catch (e) {
      setFormErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stage: CropPhenologyItem) {
    const confirmed = await confirmDialog({
      title: '删除物候阶段',
      message: `确认删除「${stage.cropName} / ${stage.stage}」?`,
      confirmLabel: '删除',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deletePhenology(stage.id);
      showToast('已删除物候阶段');
      void reload();
    } catch (e) {
      showToast(errMsg(e), { duration: 5000 });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <Sprout className="h-5 w-5 text-[#0078D4]" />
            标准物候模型
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
            维护各作物生长阶段的预设累计天数,作为批次生长周期偏离预警的基准。
          </p>
        </div>
        <button type="button" onClick={() => setShowModal(true)} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" />
          新增阶段
        </button>
      </div>

      <div className="fluent-scrollbar flex-1 overflow-y-auto p-5">
        {loading && <LoadingState label="加载物候模型中..." />}
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState title="尚未配置任何标准物候模型" description="新增作物阶段后,批次偏离预警可使用这些累计天数作为基准。" />
        )}
        {!loading && !error && Object.entries(grouped).length > 0 && (
          <div className="space-y-4">
            {Object.entries(grouped).map(([crop, stages]) => {
              const sortedStages = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
              const total = sortedStages.reduce((s, x) => s + x.expectedDays, 0);
              return (
                <section key={crop} className="border border-[#E1DFDD] bg-white">
                  <div className="flex flex-col gap-1 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
                      <Sprout className="h-4 w-4 text-[#0078D4]" />
                      {crop}
                    </h3>
                    <span className="text-xs font-semibold text-[#605E5C]">标准全周期 {total} 天 · {sortedStages.length} 个阶段</span>
                  </div>
                  <div className={fluentTable.wrapper}>
                    <table className={fluentTable.table}>
                      <thead className={fluentTable.thead}>
                        <tr>
                          <th className={fluentTable.th}>排序</th>
                          <th className={fluentTable.th}>阶段</th>
                          <th className={fluentTable.th}>预设天数</th>
                          <th className={`${fluentTable.th} text-right`}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStages.map((stage) => (
                          <tr key={stage.id} className={fluentTable.row}>
                            <td className={`${fluentTable.td} font-mono text-[#605E5C]`}>{stage.sortOrder}</td>
                            <td className={`${fluentTable.td} font-semibold`}>{stage.stage}</td>
                            <td className={fluentTable.td}>{stage.expectedDays} 天</td>
                            <td className={`${fluentTable.td} text-right`}>
                              <button type="button" onClick={() => void handleDelete(stage)} aria-label={`删除 ${stage.cropName} ${stage.stage}`} className={fluentButton('danger')}>
                                <Trash2 className="h-4 w-4" />
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="phenology-dialog-title" className="flex w-full max-w-md flex-col overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white">
            <div className="flex min-h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-3">
              <h3 id="phenology-dialog-title" className="flex items-center gap-2 text-base font-semibold text-[#242424]">
                <Sprout className="h-5 w-5 text-[#0078D4]" />
                新增物候阶段
              </h3>
              <button type="button" onClick={() => setShowModal(false)} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div>
                <label htmlFor="phenology-crop-name" className="mb-1 block text-xs font-semibold text-[#605E5C]">作物名称</label>
                <input id="phenology-crop-name" value={form.cropName} onChange={(e) => setForm({ ...form, cropName: e.target.value })} className={`${fluentInput} w-full`} placeholder="例如:芍药" />
              </div>
              <div>
                <label htmlFor="phenology-stage" className="mb-1 block text-xs font-semibold text-[#605E5C]">生长阶段</label>
                <input id="phenology-stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className={`${fluentInput} w-full`} placeholder="例如:萌芽期" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="phenology-days" className="mb-1 block text-xs font-semibold text-[#605E5C]">预设天数</label>
                  <input id="phenology-days" type="number" min={0} value={form.expectedDays} onChange={(e) => setForm({ ...form, expectedDays: Number(e.target.value) })} className={`${fluentInput} w-full`} />
                </div>
                <div>
                  <label htmlFor="phenology-sort" className="mb-1 block text-xs font-semibold text-[#605E5C]">排序</label>
                  <input id="phenology-sort" type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={`${fluentInput} w-full`} />
                </div>
              </div>
              {formErr && <p role="alert" className="border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-sm text-[#A4262C]">{formErr}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={() => setShowModal(false)} className={fluentButton('secondary')}>取消</button>
              <button type="button" onClick={() => void handleCreate()} disabled={saving} className={fluentButton('primary')}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
