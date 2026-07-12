import { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Camera, Loader2, Upload, Lightbulb, Images } from 'lucide-react';
import { aiChat, aiDiagnose, aiAdvice } from '../api/ai';
import { uploadImage } from '../api/uploads';
import { listBatches, type Batch } from '../api/batches';
import AiDataQa from './AiDataQa';
import { fluentButton, fluentInput, fluentSelect } from '../ui/fluent';
import { EmptyState, ErrorState } from '../ui/state';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// AI 助手:合并「AI 植保百科」(文本问答)与「AI 视觉诊断」(上传图片 → OSS → 诊断)。
export default function AiAssistant() {
  // ── AI 植保百科 ──
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatErr, setChatErr] = useState('');

  async function handleAsk() {
    const q = query.trim();
    if (!q) return;
    setChatLoading(true);
    setChatErr('');
    setAnswer('');
    try {
      const res = await aiChat(q);
      setAnswer(res.answer);
    } catch (e) {
      setChatErr(errMsg(e));
    } finally {
      setChatLoading(false);
    }
  }

  // ── AI 视觉诊断 ──
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState('');
  const [uploading, setUploading] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState('');

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDiagErr('');
    setResult('');
    setImageUrl('');
    try {
      const res = await uploadImage(file, 'ai-diagnose');
      setImageUrl(res.url);
      setImageName(file.name);
    } catch (err) {
      setDiagErr(errMsg(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDiagnose() {
    if (!imageUrl) return;
    setDiagLoading(true);
    setDiagErr('');
    setResult('');
    try {
      const res = await aiDiagnose({ imageUrl, note: note.trim() || undefined });
      setResult(res.result);
    } catch (err) {
      setDiagErr(errMsg(err));
    } finally {
      setDiagLoading(false);
    }
  }

  // ── 批量诊断 ──
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<{ name: string; result: string }[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchErr, setBatchErr] = useState('');

  async function handleBatchDiagnose() {
    if (batchFiles.length === 0) return;
    setBatchRunning(true);
    setBatchErr('');
    setBatchResults([]);
    const done: { name: string; result: string }[] = [];
    try {
      for (const file of batchFiles) {
        try {
          const up = await uploadImage(file, 'ai-diagnose');
          const res = await aiDiagnose({ imageUrl: up.url });
          done.push({ name: file.name, result: res.result });
          setBatchResults([...done]);
        } catch (err) {
          const msg = errMsg(err);
          if (msg.includes('额度不足')) {
            setBatchErr(`已诊断 ${done.length} 张,额度不足`);
            return;
          }
          done.push({ name: file.name, result: `诊断失败:${msg}` });
          setBatchResults([...done]);
        }
      }
    } finally {
      setBatchRunning(false);
    }
  }

  // ── AI 农事建议 ──
  const [batches, setBatches] = useState<Batch[]>([]);
  const [adviceBatchId, setAdviceBatchId] = useState('');
  const [advice, setAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceErr, setAdviceErr] = useState('');

  useEffect(() => {
    listBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  async function handleAdvice() {
    if (!adviceBatchId) return;
    setAdviceLoading(true);
    setAdviceErr('');
    setAdvice('');
    try {
      const res = await aiAdvice({ batchId: adviceBatchId });
      setAdvice(res.answer);
    } catch (err) {
      setAdviceErr(errMsg(err));
    } finally {
      setAdviceLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#242424]">AI 助手</h1>
          <p className="text-sm text-[#605E5C]">植保知识问答与作物图像智能诊断</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* AI 植保百科 */}
        <section className="border border-[#E1DFDD] bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-[#242424]">
            <BookOpen className="h-5 w-5 text-[#0078D4]" />
            <h2 className="font-semibold">AI 植保百科</h2>
          </div>
          <p className="mb-3 text-sm text-[#605E5C]">输入作物病虫害、栽培或用药问题，获取专业解答。</p>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            placeholder="例如：芍药叶片出现褐色斑点，如何防治？"
            className={`${fluentInput} h-auto min-h-24 w-full resize-none py-2`}
          />
          <button
            type="button"
            onClick={handleAsk}
            disabled={chatLoading || !query.trim()}
            className={`${fluentButton('primary')} mt-3`}
          >
            {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {chatLoading ? '思考中...' : '提问'}
          </button>
          {chatErr && <ErrorState message={chatErr} retryLabel="关闭" onRetry={() => setChatErr('')} className="mt-3" />}
          {answer && (
            <div className="mt-4 whitespace-pre-wrap border border-[#E1DFDD] bg-[#F5F9FF] p-4 text-sm leading-6 text-[#242424]">
              {answer}
            </div>
          )}
        </section>

        {/* AI 视觉诊断 */}
        <section className="border border-[#E1DFDD] bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-[#242424]">
            <Camera className="h-5 w-5 text-[#0078D4]" />
            <h2 className="font-semibold">AI 视觉诊断</h2>
          </div>
          <p className="mb-3 text-sm text-[#605E5C]">上传作物照片，AI 识别病害并给出处理建议。</p>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[#C8C6C4] bg-[#FAFAFA] px-4 py-6 text-sm text-[#605E5C] hover:border-[#0078D4]">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-[#0078D4]" />
            ) : (
              <Upload className="h-6 w-6 text-[#8A8886]" />
            )}
            <span>{uploading ? '上传中...' : imageName || '点击选择图片（≤5MB）'}</span>
            <input
              aria-label="选择诊断图片"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickImage}
              disabled={uploading}
              className="hidden"
            />
          </label>

          {imageUrl && (
            <img src={imageUrl} alt={imageName} className="mt-3 max-h-48 w-full object-contain" />
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="补充说明（可选）"
            className={`${fluentInput} mt-3 w-full`}
          />
          <button
            type="button"
            onClick={handleDiagnose}
            disabled={diagLoading || !imageUrl}
            className={`${fluentButton('primary')} mt-3`}
          >
            {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {diagLoading ? '诊断中...' : '开始诊断'}
          </button>
          {diagErr && <ErrorState message={diagErr} retryLabel="关闭" onRetry={() => setDiagErr('')} className="mt-3" />}
          {result && (
            <div className="mt-4 whitespace-pre-wrap border border-[#E1DFDD] bg-[#F5F9FF] p-4 text-sm leading-6 text-[#242424]">
              {result}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* AI 数据问答 */}
        <AiDataQa />

        {/* AI 农事建议 */}
        <section className="border border-[#E1DFDD] bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-[#242424]">
            <Lightbulb className="h-5 w-5 text-[#0078D4]" />
            <h2 className="font-semibold">AI 农事建议</h2>
          </div>
          <p className="mb-3 text-sm text-[#605E5C]">选择一个批次，AI 结合作物物候与近期农事给出未来一周的管理建议。</p>
          <select
            aria-label="选择建议批次"
            value={adviceBatchId}
            onChange={(e) => setAdviceBatchId(e.target.value)}
            className={`${fluentSelect} w-full`}
          >
            <option value="">请选择批次</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batchNo} · {b.cropName}</option>
            ))}
          </select>
          {batches.length === 0 && (
            <EmptyState title="暂无可选批次" description="创建批次后即可选择批次生成真实 AI 农事建议。" className="mt-3 border border-[#E1DFDD]" />
          )}
          <button
            type="button"
            onClick={handleAdvice}
            disabled={adviceLoading || !adviceBatchId}
            className={`${fluentButton('primary')} mt-3`}
          >
            {adviceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            {adviceLoading ? '生成中...' : '获取 AI 农事建议'}
          </button>
          {adviceErr && <ErrorState message={adviceErr} retryLabel="关闭" onRetry={() => setAdviceErr('')} className="mt-3" />}
          {advice && (
            <div className="mt-4 whitespace-pre-wrap border border-[#E1DFDD] bg-[#F5F9FF] p-4 text-sm leading-6 text-[#242424]">{advice}</div>
          )}
        </section>
      </div>

      {/* AI 批量诊断 */}
      <section className="border border-[#E1DFDD] bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-[#242424]">
          <Images className="h-5 w-5 text-[#0078D4]" />
          <h2 className="font-semibold">AI 批量诊断</h2>
        </div>
        <p className="mb-3 text-sm text-[#605E5C]">一次选择多张作物照片，AI 逐张识别病害。若额度不足将停止并提示已诊断数量。</p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[#C8C6C4] bg-[#FAFAFA] px-4 py-6 text-sm text-[#605E5C] hover:border-[#0078D4]">
          <Upload className="h-6 w-6 text-[#8A8886]" />
          <span>{batchFiles.length > 0 ? `已选择 ${batchFiles.length} 张` : '点击选择多张图片（每张 ≤5MB）'}</span>
          <input
            aria-label="选择批量诊断图片"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setBatchFiles(Array.from(e.target.files ?? []))}
            disabled={batchRunning}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={handleBatchDiagnose}
          disabled={batchRunning || batchFiles.length === 0}
          className={`${fluentButton('primary')} mt-3`}
        >
          {batchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
          {batchRunning ? '诊断中...' : '批量诊断'}
        </button>
        {batchErr && <ErrorState title="批量诊断已停止" message={batchErr} retryLabel="关闭" onRetry={() => setBatchErr('')} className="mt-3" />}
        {batchResults.length > 0 && (
          <div className="mt-4 space-y-3">
            {batchResults.map((r, i) => (
              <div key={i} className="border border-[#E1DFDD] bg-[#FAFAFA] p-4 text-sm text-[#242424]">
                <div className="mb-1 font-semibold text-[#242424]">{r.name}</div>
                <div className="whitespace-pre-wrap">{r.result}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
