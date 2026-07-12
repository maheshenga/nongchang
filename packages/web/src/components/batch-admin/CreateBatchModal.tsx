import { useRef, useState, type FormEvent } from 'react';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';
import { createBatch } from '../../api/batches';
import type { Field } from '../../api/fields';

export function CreateBatchModal({ fields, onClose, onCreated }: { fields: Field[]; onClose(): void; onCreated(): Promise<void> | void }) {
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

  return <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="createBatchTitle" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-[6px] bg-white p-6 shadow-lg">
      <h3 id="createBatchTitle" className="text-lg font-bold text-slate-800">新建批次</h3>
      {fields.length === 0 && <p className="text-sm text-amber-600">请先创建地块后再建批次。</p>}
      <label htmlFor="create-batch-field" className="block text-xs font-bold text-slate-500">所属地块<select id="create-batch-field" value={fieldId} onChange={event => setFieldId(event.target.value)} required autoFocus disabled={submitting} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
      <label htmlFor="create-batch-batchNo" className="block text-xs font-bold text-slate-500">批次号<input id="create-batch-batchNo" value={batchNo} onChange={event => setBatchNo(event.target.value)} required disabled={submitting} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label htmlFor="create-batch-cropName" className="block text-xs font-bold text-slate-500">品种<input id="create-batch-cropName" value={cropName} onChange={event => setCropName(event.target.value)} required disabled={submitting} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label htmlFor="create-batch-plantDate" className="block text-xs font-bold text-slate-500">种植日期<input id="create-batch-plantDate" type="date" value={plantDate} onChange={event => setPlantDate(event.target.value)} required disabled={submitting} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label htmlFor="create-batch-harvest" className="block text-xs font-bold text-slate-500">预计收获<input id="create-batch-harvest" type="date" value={expectedHarvest} onChange={event => setExpectedHarvest(event.target.value)} required disabled={submitting} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      {err && <p className="text-xs text-rose-500">{err}</p>}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50">取消</button><button type="submit" disabled={submitting || fields.length === 0} className="rounded-lg bg-[#0078D4] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? '提交中…' : '创建'}</button></div>
    </form>
  </div>;
}
