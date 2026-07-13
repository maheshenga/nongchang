import { useRef, useState, type FormEvent } from 'react';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';
import { createBatch } from '../../api/batches';
import type { Field } from '../../api/fields';
import { fluentButton, fluentInput, fluentSelect } from '../../ui/fluent';
import { ModalSurface } from '../../ui/ModalSurface';

export function CreateBatchModal({
  fields,
  onClose,
  onCreated,
}: {
  fields: Field[];
  onClose(): void;
  onCreated(): Promise<void> | void;
}) {
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [batchNo, setBatchNo] = useState('');
  const [cropName, setCropName] = useState('');
  const [plantDate, setPlantDate] = useState('');
  const [expectedHarvest, setExpectedHarvest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErr(null);
    const field = fields.find(item => item.id === fieldId);
    if (!field) {
      submittingRef.current = false;
      setErr('请选择地块');
      return;
    }
    setSubmitting(true);
    try {
      const dto: CreateBatchDto = {
        ownerId: field.ownerId,
        fieldId: field.id,
        batchNo,
        cropName,
        plantDate: new Date(plantDate).toISOString(),
        expectedHarvest: new Date(expectedHarvest).toISOString(),
        status: BatchStatus.PLANTING,
      };
      await createBatch(dto);
      await onCreated();
    } catch (error) {
      setErr(error instanceof Error ? error.message : '创建失败');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface
      title="新建批次"
      onClose={onClose}
      closeDisabled={submitting}
      maxWidthClassName="max-w-md"
      initialFocusSelector="#create-batch-field"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={fluentButton('secondary')}>
            取消
          </button>
          <button
            type="submit"
            form="create-batch-form"
            disabled={submitting || fields.length === 0}
            className={fluentButton('primary')}
          >
            {submitting ? '提交中…' : '创建'}
          </button>
        </>
      )}
    >
      <form id="create-batch-form" onSubmit={submit} className="space-y-4 p-5">
        {fields.length === 0 && <p className="text-sm text-[#8A6A00]">请先创建地块后再建批次。</p>}
        <label htmlFor="create-batch-field" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          所属地块
          <select
            id="create-batch-field"
            value={fieldId}
            onChange={event => setFieldId(event.target.value)}
            required
            disabled={submitting}
            className={`${fluentSelect} w-full`}
          >
            {fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
          </select>
        </label>
        <label htmlFor="create-batch-batchNo" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          批次号
          <input
            id="create-batch-batchNo"
            value={batchNo}
            onChange={event => setBatchNo(event.target.value)}
            required
            disabled={submitting}
            className={`${fluentInput} w-full`}
          />
        </label>
        <label htmlFor="create-batch-cropName" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          品种
          <input
            id="create-batch-cropName"
            value={cropName}
            onChange={event => setCropName(event.target.value)}
            required
            disabled={submitting}
            className={`${fluentInput} w-full`}
          />
        </label>
        <label htmlFor="create-batch-plantDate" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          种植日期
          <input
            id="create-batch-plantDate"
            type="date"
            value={plantDate}
            onChange={event => setPlantDate(event.target.value)}
            required
            disabled={submitting}
            className={`${fluentInput} w-full`}
          />
        </label>
        <label htmlFor="create-batch-harvest" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          预计收获
          <input
            id="create-batch-harvest"
            type="date"
            value={expectedHarvest}
            onChange={event => setExpectedHarvest(event.target.value)}
            required
            disabled={submitting}
            className={`${fluentInput} w-full`}
          />
        </label>
        {err && <p className="text-sm font-semibold text-[#A4262C]">{err}</p>}
      </form>
    </ModalSurface>
  );
}
