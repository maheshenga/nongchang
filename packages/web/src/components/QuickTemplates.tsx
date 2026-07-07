import { useState } from 'react';
import { LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import type { QuickTemplateView, QuickTemplateInput } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { alertDialog, confirmDialog } from '../hooks/useDialog';
import { listQuickTemplates, createQuickTemplate, updateQuickTemplate, deleteQuickTemplate } from '../api/quick-template';
import { fluentButton, fluentInput, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

interface EditState {
  id: string | null;
  name: string;
  action: string;
  note: string;
  cost: string;
  labor: string;
  sort: string;
}

const EMPTY: EditState = { id: null, name: '', action: '', note: '', cost: '', labor: '', sort: '' };

export default function QuickTemplates() {
  const { data, loading, error, reload } = useApi(listQuickTemplates);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const templates = data ?? [];

  const openCreate = () => { setErr(null); setEdit({ ...EMPTY }); };
  const openEdit = (t: QuickTemplateView) => {
    setErr(null);
    setEdit({
      id: t.id,
      name: t.name,
      action: t.action,
      note: t.note ?? '',
      cost: t.cost != null ? String(t.cost) : '',
      labor: t.labor != null ? String(t.labor) : '',
      sort: String(t.sort),
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setSubmitting(true);
    setErr(null);
    const dto: QuickTemplateInput = {
      name: edit.name.trim(),
      action: edit.action.trim(),
      ...(edit.note.trim() ? { note: edit.note.trim() } : {}),
      ...(edit.cost !== '' ? { cost: Number(edit.cost) } : {}),
      ...(edit.labor !== '' ? { labor: Number(edit.labor) } : {}),
      ...(edit.sort !== '' ? { sort: Number(edit.sort) } : {}),
    };
    try {
      if (edit.id) await updateQuickTemplate(edit.id, dto);
      else await createQuickTemplate(dto);
      setEdit(null);
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (t: QuickTemplateView) => {
    const confirmed = await confirmDialog({
      title: '删除模板',
      message: `确认删除模板「${t.name}」?`,
      confirmLabel: '删除',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteQuickTemplate(t.id);
      await reload();
    } catch (e2) {
      await alertDialog({ title: '删除失败', message: e2 instanceof Error ? e2.message : '删除失败', tone: 'danger' });
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <LayoutTemplate className="h-5 w-5 text-[#0078D4]" />
            快捷模板
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
            模板为租户共享。农户在小程序「记一笔」点击模板可一键回填农事动作、备注、成本、工时。
          </p>
        </div>
        <button type="button" onClick={openCreate} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" />
          新建模板
        </button>
      </div>

      {loading && <LoadingState label="加载快捷模板中..." />}
      {error && <ErrorState message={`加载失败:${error}`} onRetry={() => void reload()} />}

      {!loading && !error && (
        <div className={fluentTable.wrapper}>
          {templates.length === 0 ? (
            <EmptyState title="暂无模板" description="新增后,小程序农事记录可直接复用这些动作预设。" />
          ) : (
            <table className={fluentTable.table}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>名称</th>
                  <th className={fluentTable.th}>农事动作</th>
                  <th className={fluentTable.th}>备注</th>
                  <th className={fluentTable.th}>成本/工时</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className={fluentTable.row}>
                    <td className={`${fluentTable.td} font-semibold`}>{t.name}</td>
                    <td className={fluentTable.td}>{t.action}</td>
                    <td className={`${fluentTable.td} max-w-[14rem] truncate text-[#605E5C]`} title={t.note ?? ''}>{t.note || '-'}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{t.cost != null ? `¥${t.cost}` : '-'} / {t.labor != null ? `${t.labor}天` : '-'}</td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex items-center justify-end gap-2">
                        <button type="button" onClick={() => openEdit(t)} aria-label={`编辑 ${t.name}`} className={fluentButton('secondary')}>
                          编辑
                        </button>
                        <button type="button" onClick={() => void onDelete(t)} aria-label={`删除 ${t.name}`} className={fluentButton('danger')}>
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setEdit(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="quick-template-dialog-title" className="w-full max-w-lg overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex min-h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-3">
              <h3 id="quick-template-dialog-title" className="text-base font-semibold text-[#242424]">{edit.id ? '编辑模板' : '新建模板'}</h3>
              <button type="button" onClick={() => setEdit(null)} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 px-5 py-5">
              <div>
                <label htmlFor="quick-template-name" className="mb-1 block text-xs font-semibold text-[#605E5C]">名称</label>
                <input id="quick-template-name" className={`${fluentInput} w-full`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="如:浇水" required />
              </div>
              <div>
                <label htmlFor="quick-template-action" className="mb-1 block text-xs font-semibold text-[#605E5C]">农事动作</label>
                <input id="quick-template-action" className={`${fluentInput} w-full`} value={edit.action} onChange={(e) => setEdit({ ...edit, action: e.target.value })} placeholder="如:浇水" required />
              </div>
              <div>
                <label htmlFor="quick-template-note" className="mb-1 block text-xs font-semibold text-[#605E5C]">预设备注(可选)</label>
                <textarea id="quick-template-note" className={`${fluentInput} min-h-16 w-full py-2`} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="如:滴灌 30 分钟" rows={2} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="quick-template-cost" className="mb-1 block text-xs font-semibold text-[#605E5C]">成本(元)</label>
                  <input id="quick-template-cost" className={`${fluentInput} w-full`} type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} placeholder="可选" />
                </div>
                <div>
                  <label htmlFor="quick-template-labor" className="mb-1 block text-xs font-semibold text-[#605E5C]">工时(天)</label>
                  <input id="quick-template-labor" className={`${fluentInput} w-full`} type="number" value={edit.labor} onChange={(e) => setEdit({ ...edit, labor: e.target.value })} placeholder="可选" />
                </div>
                <div>
                  <label htmlFor="quick-template-sort" className="mb-1 block text-xs font-semibold text-[#605E5C]">排序</label>
                  <input id="quick-template-sort" className={`${fluentInput} w-full`} type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} placeholder="0" />
                </div>
              </div>
              {err && <div role="alert" className="border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-sm text-[#A4262C]">{err}</div>}
              <div className="flex justify-end gap-2 border-t border-[#E1DFDD] pt-4">
                <button type="button" onClick={() => setEdit(null)} className={fluentButton('secondary')}>取消</button>
                <button type="submit" disabled={submitting} className={fluentButton('primary')}>{submitting ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
