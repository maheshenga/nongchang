import { useCallback, useEffect, useState } from 'react';
import { X, ShieldCheck, FlaskConical, FileText, Trash2, Upload, Loader2, Plus } from 'lucide-react';
import type { TraceCredentialType, TraceCredentialView } from '@nongchang/shared';
import { listCredentials, createCredential, removeCredential, uploadCredentialFile } from '../api/trace-credential';

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
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg shadow-sm"><ShieldCheck className="w-5 h-5" /></div>
            权威资质 / 检测报告管理
            <span className="text-xs font-mono font-bold bg-white text-emerald-700 px-2 py-0.5 rounded ml-1 border border-emerald-100">{batchLabel}</span>
          </h3>
          <button onClick={onClose} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {err && <div className="text-sm text-rose-500 bg-rose-50 border border-rose-100 rounded-lg p-3">{err}</div>}
          {loading ? (
            <div className="text-sm text-slate-400 p-4 text-center">加载中…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-400 flex flex-col items-center justify-center p-8">
              <FileText className="w-10 h-10 mb-2 opacity-40" />
              暂未关联任何资质或检测文件
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <div className={`p-2 rounded-lg shrink-0 ${c.type === 'certificate' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                    {c.type === 'certificate' ? <ShieldCheck className="w-5 h-5" /> : <FlaskConical className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm truncate">{c.title}
                      <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{TYPE_LABEL[c.type]}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {c.issuer}{c.serialNo ? ` · ${c.serialNo}` : ''}{c.issuedAt ? ` · ${c.issuedAt.slice(0, 10)}` : ''}
                    </div>
                  </div>
                  <a href={c.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-600 hover:underline shrink-0">查看</a>
                  <button onClick={() => handleRemove(c.id)} aria-label="删除" className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-5 shrink-0 bg-slate-50/50">
          {showForm ? (
            <CredentialForm batchId={batchId} onDone={() => { setShowForm(false); void reload(); }} onCancel={() => setShowForm(false)} />
          ) : (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm">
              <Plus className="w-4 h-4" /> 新增资质 / 检测文件
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
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-bold text-slate-500">类型
          <select value={type} onChange={(e) => setType(e.target.value as TraceCredentialType)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="certificate">认证证书</option>
            <option value="report">检测报告</option>
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-500">名称
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">颁发 / 检测机构
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">证书 / 报告编号
          <input value={serialNo} onChange={(e) => setSerialNo(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">颁发 / 检测日期
          <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">证明文件(图片 / PDF)
          <div className="mt-1 flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? '上传中…' : '选择文件'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onPickFile} />
            </label>
            {fileUrl && <span className="text-xs text-emerald-600 font-bold truncate">已上传</span>}
          </div>
        </label>
      </div>
      {err && <p className="text-rose-500 text-xs">{err}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-bold text-slate-600">取消</button>
        <button type="submit" disabled={submitting || uploading}
          className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
          {submitting ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
