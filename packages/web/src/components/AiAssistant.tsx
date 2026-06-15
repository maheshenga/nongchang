import { useState } from 'react';
import { Sparkles, BookOpen, Camera, Loader2, Upload } from 'lucide-react';
import { aiChat, aiDiagnose } from '../api/ai';
import { uploadImage } from '../api/uploads';

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
      const res = await uploadImage(file);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">AI 助手</h1>
          <p className="text-sm text-gray-500">植保知识问答与作物图像智能诊断</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI 植保百科 */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-gray-900">
            <BookOpen className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">AI 植保百科</h2>
          </div>
          <p className="mb-3 text-sm text-gray-500">输入作物病虫害、栽培或用药问题,获取专业解答。</p>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            placeholder="例如:芍药叶片出现褐色斑点,如何防治?"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={handleAsk}
            disabled={chatLoading || !query.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {chatLoading ? '思考中…' : '提问'}
          </button>
          {chatErr && <p className="mt-3 text-sm text-red-600">{chatErr}</p>}
          {answer && (
            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-emerald-50 p-4 text-sm text-gray-800">
              {answer}
            </div>
          )}
        </section>

        {/* AI 视觉诊断 */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-gray-900">
            <Camera className="h-5 w-5 text-purple-600" />
            <h2 className="font-semibold">AI 视觉诊断</h2>
          </div>
          <p className="mb-3 text-sm text-gray-500">上传作物照片,AI 识别病害并给出处理建议。</p>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:border-purple-400">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            ) : (
              <Upload className="h-6 w-6 text-gray-400" />
            )}
            <span>{uploading ? '上传中…' : imageName || '点击选择图片(≤5MB)'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickImage}
              disabled={uploading}
              className="hidden"
            />
          </label>

          {imageUrl && (
            <img src={imageUrl} alt={imageName} className="mt-3 max-h-48 w-full rounded-lg object-contain" />
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="补充说明(可选)"
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            onClick={handleDiagnose}
            disabled={diagLoading || !imageUrl}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {diagLoading ? '诊断中…' : '开始诊断'}
          </button>
          {diagErr && <p className="mt-3 text-sm text-red-600">{diagErr}</p>}
          {result && (
            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-purple-50 p-4 text-sm text-gray-800">
              {result}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
