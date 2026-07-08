import { useCallback, useEffect, useState } from 'react';
import { X, ShieldCheck, FlaskConical, Trash2, Upload, Loader2, Plus } from 'lucide-react';
import type { TraceCredentialType, TraceCredentialView } from '@nongchang/shared';
import { listCredentials, createCredential, removeCredential, uploadCredentialFile } from '../api/trace-credential';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

const TYPE_LABEL: Record<TraceCredentialType, string> = { certificate: '认证证书', report: '检测报告' };

export default function BatchCredentialModal({
  batchId, batchLabel, onClose,
}: {
  batchId: string;
  batchLabel: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<TraceCredentialView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setItems(await listCredentials(batchId)); }
    catch (e) { setErr(e instanceof Error ? e.message : '加载失败'); }
    finally { setLoading(false); }
  }, [batchId]);

  useEffect(() => { void reload(); }, [reload]);

  const handleRemove = async (id: string) => {
    try { await removeCredential(id); void reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : '删除失败'); }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border border-[#E1DFDD] bg-white shadow-xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5">
          <h3 className="flex min-w-0 items-center gap-3 text-base font-semibold text-[#242424]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="truncate">权威资质 / 检测报告管理</span>
            <span className={`${fluentStatusTag('active')} shrink-0 font-mono`}>{batchLabel}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="关闭" className={fluentButton('icon')}><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {err && <ErrorState message={err} onRetry={() => void reload()} retryLabel="重试" />}
          {loading ? (
            <LoadingState label="加载资质文件" />
          ) : items.length === 0 ? (
            <EmptyState title="暂未关联任何资质或检测文件" description="上传认证证书或检测报告后，会作为该批次的可信凭证展示。" />
          ) : (
            <div className="space-y-2">
              {items.map((c) => (
                <div key={c.id} className="flex items-center gap-3 border border-[#E1DFDD] bg-white p-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-[4px] ${c.type === 'certificate' ? 'bg-[#E5F1FB] text-[#0078D4]' : 'bg-[#F3F2F1] text-[#605E5C]'}`}>
                    {c.type === 'certificate' ? <ShieldCheck className="h-5 w-5" /> : <FlaskConical className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#242424]">{c.title}
                      <span className={`ml-2 ${fluentStatusTag(c.type === 'certificate' ? 'success' : 'neutral')}`}>{TYPE_LABEL[c.type]}</span>
                    </div>
                    <div className="truncate text-xs text-[#605E5C]">
                      {c.issuer}{c.serialNo ? ` · ${c.serialNo}` : ''}{c.issuedAt ? ` · ${c.issuedAt.slice(0, 10)}` : ''}
                    </div>
                  </div>
                  <a href={c.fileUrl} target="_blank" rel="noreferrer" className={`${fluentButton('subtle')} shrink-0`}>查看</a>
                  <button type="button" onClick={() => handleRemove(c.id)} aria-label={`删除 ${c.title}`} className={`${fluentButton('icon')} shrink-0 text-[#A4262C]`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[#E1DFDD] bg-[#FAFAFA] p-5">
          {showForm ? (
            <CredentialForm batchId={batchId} onDone={() => { setShowForm(false); void reload(); }} onCancel={() => setShowForm(false)} />
          ) : (
            <button type="button" onClick={() => setShowForm(true)} className={fluentButton('primary')}>
              <Plus className="h-4 w-4" /> 新增资质 / 检测文件
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialForm({ batchId, onDone, onCancel }: { batchId: string; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<TraceCredentialType>('certificate');
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try { setFileUrl(await uploadCredentialFile(file)); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : '上传失败'); }
    finally { setUploading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!fileUrl) { setErr('请先上传文件'); return; }
    setSubmitting(true);
    try {
      await createCredential({
        batchId, type, title, issuer,
        serialNo: serialNo || undefined,
        issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
        fileUrl,
      });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-[#605E5C]">类型
          <select value={type} onChange={(e) => setType(e.target.value as TraceCredentialType)}
            className={`${fluentSelect} w-full`}>
            <option value="certificate">认证证书</option>
            <option value="report">检测报告</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#605E5C]">名称
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            className={`${fluentInput} w-full`} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#605E5C]">颁发 / 检测机构
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} required
            className={`${fluentInput} w-full`} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#605E5C]">证书 / 报告编号
          <input value={serialNo} onChange={(e) => setSerialNo(e.target.value)}
            className={`${fluentInput} w-full`} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#605E5C]">颁发 / 检测日期
          <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)}
            className={`${fluentInput} w-full`} />
        </label>
        <div className="grid gap-1 text-sm font-semibold text-[#605E5C]">
          <span>证明文件(图片 / PDF)</span>
          <div className="flex items-center gap-2">
            <label className={`${fluentButton('secondary')} cursor-pointer`}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? '上传中…' : '选择文件'}
              <input type="file" aria-label="证明文件" accept="image/*,application/pdf" className="sr-only" onChange={onPickFile} />
            </label>
            {fileUrl && <span className={fluentStatusTag('success')}>已上传</span>}
          </div>
        </div>
      </div>
      {err && <ErrorState message={err} />}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={fluentButton('secondary')}>取消</button>
        <button type="submit" disabled={submitting || uploading}
          className={fluentButton('primary')}>
          {submitting ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
