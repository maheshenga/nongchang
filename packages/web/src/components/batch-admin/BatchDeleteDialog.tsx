import { AlertTriangle, Loader2 } from 'lucide-react';
import { fluentButton } from '../../ui/fluent';
import { ModalSurface } from '../../ui/ModalSurface';

export interface DeleteTarget {
  id: string;
  label: string;
  generated: number;
}

export function BatchDeleteDialog({
  target,
  forceConfirm,
  deleting,
  onForceConfirm,
  onClose,
  onDelete,
}: {
  target: DeleteTarget;
  forceConfirm: boolean;
  deleting: boolean;
  onForceConfirm(value: boolean): void;
  onClose(): void;
  onDelete(): void;
}) {
  return (
    <ModalSurface
      title="删除批次"
      description={`即将删除批次 ${target.label}，此操作不可恢复。`}
      tone="danger"
      onClose={onClose}
      closeDisabled={deleting}
      maxWidthClassName="max-w-md"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={deleting} className={fluentButton('secondary')}>
            取消
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || (target.generated > 0 && !forceConfirm)}
            className={fluentButton('danger')}
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? '删除中…' : target.generated > 0 ? '强制删除' : '确认删除'}
          </button>
        </>
      )}
    >
      <div className="space-y-4 p-5">
        {target.generated > 0 ? (
          <>
            <div className="flex items-start gap-3 border border-[#F1C6CA] bg-[#FFF4CE] p-4 text-sm text-[#323130]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6A00]" />
              <div>
                该批次已签发 <b>{target.generated}</b> 个溯源码。删除将连带清除全部关联溯源数据。
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#323130]">
              <input
                type="checkbox"
                checked={forceConfirm}
                onChange={event => onForceConfirm(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>我已知晓风险，确认强制删除该批次及全部关联溯源数据</span>
            </label>
          </>
        ) : (
          <p className="text-sm text-[#605E5C]">该批次尚未签发溯源码，将连带删除其农事记录。</p>
        )}
      </div>
    </ModalSurface>
  );
}
